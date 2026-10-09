// Comandos de Dead by Daylight para el chat y el overlay (!perk, !pj).
// Datos e iconos en public/dbd/ (data.json + icons/ + pj/).
//   /dbd/perk?q=adrenalina      → texto para el chat
//   /dbd/pj?q=jake              → texto para el chat
//   /dbd/perk.svg?q=adrenalina  → tarjeta para el overlay (evento image)
//   /dbd/pj.svg?q=jake          → tarjeta para el overlay (evento image)
//   /dbd/random/build?r=killer&s=12  → build al azar (!randomperks); sin r, de superviviente
//   /dbd/random/survi?s=12            → superviviente al azar (!randomsurvi)
//   /dbd/random/killer?s=12           → asesino al azar (!randomkiller)
// Las rutas random también tienen versión .svg. La semilla s ({util.count} en
// Leksimus) hace que el chat y la tarjeta del overlay saquen el mismo resultado.

const CHAT_MAX = 450;
let dataCache = null;

export function isDbdRoute(pathname) {
  return ROUTE.test(pathname);
}

const ROUTE = /^\/dbd\/(perk|pj|random\/build|random\/survi|random\/killer)(\.svg)?$/;

export async function handleDbd(url, env) {
  const [, kind, svg] = url.pathname.match(ROUTE);
  const query = (url.searchParams.get('q') || '').trim();
  const data = await loadData(env, url.origin);
  if (!data) return text('Datos de DBD no disponibles', 500);

  if (kind.startsWith('random/')) {
    const rng = seededRandom(url.searchParams.get('s'), kind);
    const user = (url.searchParams.get('u') || '').trim().slice(0, 30);
    if (kind === 'random/build') {
      const killer = /^(k|killer|asesino|asesina)$/i.test((url.searchParams.get('r') || '').trim());
      const build = randomBuild(data, rng, killer);
      return svg ? svgResponse(await buildCard(env, url.origin, build, user, rng, data)) : text(buildMessage(build));
    }
    const role = kind === 'random/survi' ? 's' : 'k';
    const pool = data.chars.filter(c => c.r === role);
    const char = pool[Math.floor(rng() * pool.length)];
    const eyebrow = user ? `Te toca, ${user}` : 'Te toca';
    if (svg) return svgResponse(await charSpinCard(env, url.origin, char, data, eyebrow, rng));
    return text(clip(`${char.n}: ${char.p.map(k => data.perkByKey[k]?.n).filter(Boolean).join(' · ')}`));
  }

  const result = kind === 'perk' ? findPerk(data, query) : findChar(data, query);

  if (result.generic) {
    return svg ? svgResponse(await genericCard(env, url.origin, result.generic)) : text(genericMessage(result.generic));
  }
  if (result.effect) {
    return svg ? svgResponse(await effectCard(env, url.origin, result.effect)) : text(effectMessage(result.effect));
  }
  if (!svg) return text(chatMessage(kind, query, result, data));
  if (!result.hit) return svgResponse(await notFoundCard(kind, query, result));
  const card = kind === 'perk'
    ? await perkCard(env, url.origin, result.hit)
    : await charCard(env, url.origin, result.hit, data);
  return svgResponse(card);
}

async function loadData(env, origin) {
  if (dataCache) return dataCache;
  const res = await env.ASSETS.fetch(new URL('/dbd/data.json', origin));
  if (!res.ok) return null;
  const data = await res.json();
  data.perkByKey = Object.fromEntries(data.perks.map(p => [p.k, p]));
  dataCache = data;
  return data;
}

export function slug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Busca por coincidencia exacta, luego por inicio y luego por contenido.
// Si queda más de un candidato, no elige: devuelve sugerencias.
function search(items, query, keysOf) {
  const q = slug(query);
  if (!q) return { hit: null, suggestions: [] };
  const tiers = [
    item => keysOf(item).some(k => k === q),
    item => keysOf(item).some(k => k.startsWith(q)),
    item => q.length >= 3 && keysOf(item).some(k => k.includes(q)),
  ];
  for (const test of tiers) {
    const found = items.filter(test);
    if (found.length === 1) return { hit: found[0], suggestions: [] };
    if (found.length > 1) return { hit: null, suggestions: found.slice(0, 4) };
  }
  return fuzzy(items, q, keysOf);
}

// Erratas: elige el nombre más parecido si queda claramente por delante;
// si no, devuelve los más cercanos como sugerencias.
function fuzzy(items, q, keysOf) {
  if (q.length < 3) return { hit: null, suggestions: [] };
  const limit = q.length <= 5 ? 1 : q.length <= 9 ? 2 : 3;
  const scored = items
    .map(item => ({ item, d: Math.min(...keysOf(item).map(k => distance(q, k))) }))
    .sort((a, b) => a.d - b.d);
  const [best, second] = scored;
  if (best.d <= limit && (!second || second.d > best.d)) return { hit: best.item, suggestions: [] };
  // Para sugerir basta con compartir buena parte de las parejas de letras
  // ("clodet" → Claudette), pero no con estar a pocas letras de un nombre corto.
  const close = items
    .map(item => ({ item, s: Math.max(...keysOf(item).map(k => similarity(q, k))) }))
    .filter(x => x.s >= 0.4)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(x => x.item);
  return { hit: null, suggestions: close };
}

function similarity(a, b) {
  const pairs = s => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
  const pa = pairs(a);
  const pb = pairs(b);
  if (!pa.length || !pb.length) return 0;
  const pool = [...pb];
  let common = 0;
  for (const p of pa) {
    const i = pool.indexOf(p);
    if (i >= 0) { common++; pool.splice(i, 1); }
  }
  return (2 * common) / (pa.length + pb.length);
}

// Distancia de Damerau-Levenshtein (una letra cambiada, sobrante, que falta o dos letras al revés).
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

// Efectos de estado. Cada perk trae en data.json los que menciona (campo fx),
// detectados en su descripción completa. Alias: nombre en inglés y erratas habituales.
const EFFECTS = [
  ['Celeridad', ['haste']], ['Entorpecimiento', ['hindered']], ['Agotamiento', ['exhausted', 'exhaustion', 'agotado']],
  ['Resistencia', ['endurance']], ['Quebranto', ['broken', 'roto']], ['Esquiva', ['evasion', 'evacion']],
  ['Indetectable', ['undetectable']], ['Ceguera', ['blindness', 'blind', 'ciego']], ['Inconsciencia', ['oblivious']],
  ['Hemorragia', ['hemorrhage']], ['Laceración', ['mangled']], ['Vulnerabilidad', ['exposed', 'expuesto']],
  ['Herida profunda', ['deepwound']], ['Incapacitación', ['incapacitated']], ['Desesperanza', ['hopelessness']],
  ['Debilidad', ['weakened']], ['Sed de sangre', ['bloodlust']], ['Gritar', ['grito', 'scream']], ['Auras', ['aura', 'aurareading']],
].map(([name, aliases]) => ({ name, keys: [slug(name), ...aliases.map(slug)] }));

const ROLE_WORD = /^(k|killers?|asesin[ao]s?|s|survis?|supervivientes?)$/;

function findEffect(query) {
  const words = query.trim().split(/\s+/);
  let role = null;
  if (words.length > 1 && ROLE_WORD.test(slug(words.at(-1)))) role = /^(k|killer|asesin)/.test(slug(words.pop())) ? 'k' : 's';
  const q = slug(words.join(' '));
  if (q.length < 4) return null;
  const effect = EFFECTS.find(e => e.keys.includes(q))
    || EFFECTS.find(e => e.keys.some(k => k.startsWith(q)))
    || (q.length >= 6 ? EFFECTS.find(e => e.keys.some(k => distance(q, k) <= 1)) : null);
  return effect ? { name: effect.name, role } : null;
}

function findPerk(data, query) {
  const q = slug(query);
  const exact = data.perks.filter(p => p.k === q || slug(p.en) === q);
  if (exact.length === 1) return { hit: exact[0], suggestions: [] };
  const effect = findEffect(query);
  if (effect) {
    const perks = data.perks.filter(p => p.fx?.includes(effect.name) && (!effect.role || p.r === effect.role));
    return { hit: null, suggestions: [], effect: { ...effect, perks } };
  }
  return search(data.perks, query, p => [p.k, slug(p.en)]);
}

const GENERIC = /^(generic[ao]s?|general(es)?)(de)?(killers?|asesin[ao]s?|k|survis?|supervivientes?|s)?$/;

function findChar(data, query) {
  const q = slug(query);
  const generic = q.match(GENERIC);
  if (generic) {
    const role = /^(killer|asesin|k$)/.test(generic[4] || '') ? 'k' : 's';
    return { hit: null, generic: { role, perks: data.perks.filter(p => !p.c && p.r === role) }, suggestions: [] };
  }
  return search(data.chars, query, c => c.a);
}

function chatMessage(kind, query, result, data) {
  const cmd = kind === 'perk' ? '!perk' : '!pj';
  if (!slug(query)) {
    return kind === 'perk' ? 'Uso: !perk <nombre>, por ejemplo !perk adrenalina' : 'Uso: !pj <personaje>, por ejemplo !pj jake';
  }
  if (!result.hit) {
    const list = result.suggestions.map(x => x.n).join(', ');
    return list ? `No sé cuál es "${query}". ¿Quizá ${list}? Escribe ${cmd} con uno de esos nombres.` : `No encuentro "${query}". Prueba con el nombre en inglés o solo una parte.`;
  }
  if (kind === 'perk') {
    const p = result.hit;
    const change = p.ch ? ' [cambió en 10.2.0]' : '';
    return clip(`${p.n} (${p.c || 'genérica'}): ${p.t}${change}`);
  }
  const c = result.hit;
  const names = c.p.map(k => data.perkByKey[k]?.n).filter(Boolean);
  return clip(`${c.n} (${c.r === 's' ? 'superviviente' : 'asesino'}): ${names.join(' · ')}`);
}

function clip(message) {
  return message.length <= CHAT_MAX ? message : message.slice(0, CHAT_MAX - 1).trimEnd() + '…';
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

function svgResponse(svg) {
  return new Response(svg, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

// --- Tarjetas SVG -----------------------------------------------------------
// Un <img> no carga recursos externos dentro de un SVG, así que los iconos van
// embebidos como data URI.

const C = { bg: '#141218', panel: '#1c1922', line: '#3a3444', fg: '#ece6dc', dim: '#b3abbd', blood: '#c4302b', perk: '#4b2a6e', perkHi: '#7b4bb0' };
const FONT = "'Segoe UI', 'Source Sans 3', Arial, sans-serif";

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function dataUri(env, origin, path) {
  if (!path) return null;
  const res = await env.ASSETS.fetch(new URL('/dbd/' + path, origin));
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return `data:image/webp;base64,${btoa(binary)}`;
}

function wrap(value, maxChars, maxLines) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = (last.includes(' ') ? last.replace(/\s*\S*$/, '') : last) + '…';
  }
  return lines;
}

function diamond(cx, cy, size, icon, id) {
  const half = size / 2;
  const inner = size * 0.36;
  return `<defs><radialGradient id="g${id}" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="${C.perkHi}"/><stop offset="1" stop-color="${C.perk}"/></radialGradient></defs>`
    + `<rect x="${cx - inner}" y="${cy - inner}" width="${inner * 2}" height="${inner * 2}" transform="rotate(45 ${cx} ${cy})" fill="url(#g${id})" stroke="#9a73c9" stroke-width="2"/>`
    + (icon ? `<image href="${icon}" x="${cx - half}" y="${cy - half}" width="${size}" height="${size}"/>` : '');
}

function frame(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`
    + `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="${C.bg}" fill-opacity="0.94" stroke="${C.line}" stroke-width="2"/>`
    + body + '</svg>';
}

async function perkCard(env, origin, perk) {
  const icon = await dataUri(env, origin, perk.i);
  const lines = wrap(perk.t, 60, 6);
  const height = Math.max(230, 128 + lines.length * 30);
  let body = diamond(110, 115, 170, icon, 'p');
  body += `<text x="220" y="70" fill="${C.fg}" font-size="38" font-weight="700">${esc(perk.n)}</text>`;
  body += `<text x="220" y="100" fill="${C.dim}" font-size="19">${esc(perk.c || 'Genérica')} · ${esc(perk.en)}</text>`;
  if (perk.ch) {
    const label = perk.ch === 'rework' ? 'REWORK 10.2.0' : 'CAMBIÓ EN 10.2.0';
    body += `<rect x="${width0() - 214}" y="26" width="190" height="30" rx="4" fill="${C.blood}"/>`
      + `<text x="${width0() - 119}" y="47" fill="#fff" font-size="16" font-weight="700" text-anchor="middle">${label}</text>`;
  }
  lines.forEach((line, i) => {
    body += `<text x="220" y="${142 + i * 30}" fill="${C.fg}" font-size="21">${esc(line)}</text>`;
  });
  return frame(width0(), height, body);
}

function width0() { return 900; }

async function charCard(env, origin, char, data, eyebrow = '') {
  const perks = char.p.map(k => data.perkByKey[k]).filter(Boolean);
  const [portrait, ...icons] = await Promise.all([
    dataUri(env, origin, char.i),
    ...perks.map(p => dataUri(env, origin, p.i)),
  ]);
  const width = 900;
  const height = 340;
  let body = `<clipPath id="pc"><rect x="30" y="30" width="220" height="260" rx="10"/></clipPath>`
    + `<rect x="30" y="30" width="220" height="260" rx="10" fill="${C.panel}"/>`
    + (portrait ? `<image href="${portrait}" x="10" y="40" width="260" height="260" clip-path="url(#pc)" preserveAspectRatio="xMidYMid slice"/>` : '');
  body += `<text x="280" y="74" fill="${C.fg}" font-size="38" font-weight="700">${esc(char.n)}</text>`;
  body += `<text x="280" y="104" fill="${C.dim}" font-size="19">${eyebrow ? esc(eyebrow) + ' · ' : ''}${char.r === 's' ? 'Superviviente' : 'Asesino'}${char.en && char.en !== char.n ? ' · ' + esc(char.en) : ''}</text>`;
  perks.forEach((perk, i) => {
    const cx = 370 + i * 200;
    body += diamond(cx, 182, 120, icons[i], 'c' + i);
    wrap(perk.n, 20, 3).forEach((line, j) => {
      body += `<text x="${cx}" y="${266 + j * 24}" fill="${C.fg}" font-size="19" font-weight="600" text-anchor="middle">${esc(line)}</text>`;
    });
    if (perk.ch) body += `<rect x="${cx + 26}" y="122" width="48" height="22" rx="4" fill="${C.blood}"/><text x="${cx + 50}" y="138" fill="#fff" font-size="14" font-weight="700" text-anchor="middle">10.2</text>`;
  });
  return frame(width, height, body);
}

async function notFoundCard(kind, query, result) {
  const list = result.suggestions.map(x => x.n).join(' · ');
  const body = `<text x="30" y="62" fill="${C.fg}" font-size="30" font-weight="700">${esc(list ? `¿Quizá buscas…?` : `No encuentro "${query}"`)}</text>`
    + `<text x="30" y="102" fill="${C.dim}" font-size="21">${esc(list || (kind === 'perk' ? 'Prueba con !perk y el nombre en español o inglés' : 'Prueba con !pj y el nombre del personaje'))}</text>`;
  return frame(900, 140, body);
}

// --- Sorteos ------------------------------------------------------------------

function seededRandom(seed, salt) {
  if (!seed) return Math.random;
  let h = 2166136261;
  for (const ch of `${salt}:${seed}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickMany(list, count, rng) {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

const ITEM_TYPES = { medkit: 'Botiquín', toolbox: 'Caja de herramientas', flashlight: 'Linterna', key: 'Llave', map: 'Mapa', fogvial: 'Frasco de niebla' };

function randomBuild(data, rng, killer) {
  if (killer) {
    const [char] = pickMany(data.chars.filter(c => c.r === 'k'), 1, rng);
    return {
      role: 'k',
      killer: char,
      perks: pickMany(data.perks.filter(p => p.r === 'k'), 4, rng),
      adds: pickMany(data.adds.filter(a => a.kl === char.k), 2, rng),
    };
  }
  const [item] = pickMany(data.items.filter(i => !i.ev && ITEM_TYPES[i.t]), 1, rng);
  return {
    role: 's',
    item,
    perks: pickMany(data.perks.filter(p => p.r === 's'), 4, rng),
    adds: pickMany(data.adds.filter(a => a.t === item.t), 2, rng),
  };
}

const RARITY = {
  common: ['#8a6a4b', 'Común'],
  uncommon: ['#b89b2c', 'Poco común'],
  rare: ['#3e8a3c', 'Rara'],
  veryrare: ['#7a3fb0', 'Muy rara'],
  visceral: ['#b4204f', 'Visceral'],
  none: ['#555555', 'Accesorio'],
};

function square(x, y, size, icon, rarity, id) {
  const [color] = RARITY[rarity] || RARITY.common;
  return `<defs><linearGradient id="q${id}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.45"/></linearGradient></defs>`
    + `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="6" fill="url(#q${id})" stroke="${color}" stroke-width="2"/>`
    + (icon ? `<image href="${icon}" x="${x + 4}" y="${y + 4}" width="${size - 8}" height="${size - 8}"/>` : '');
}

function labelBlock(x, label, name, chars = 20) {
  let out = `<text x="${x}" y="368" fill="${C.dim}" font-size="15" font-weight="600" letter-spacing="1">${esc(label.toUpperCase())}</text>`;
  wrap(name, chars, 2).forEach((line, j) => {
    out += `<text x="${x}" y="${394 + j * 22}" fill="${C.fg}" font-size="18" font-weight="600">${esc(line)}</text>`;
  });
  return out;
}

// --- Ruleta ------------------------------------------------------------------
// Las tarjetas de los sorteos giran como una ruleta: cada hueco pasa iconos al
// azar durante SPIN_START segundos y luego se detiene un hueco por segundo.
// La animación es CSS dentro del propio SVG, así que funciona en el <img> del overlay.

const SPIN_START = 6;     // segundo en que se para el primer hueco
const SPIN_FRAMES = 8;    // iconos que pasan por cada hueco en bucle
const SPIN_STEP = 0.09;   // segundos que se ve cada icono al girar

const SPIN_CSS = `<style>`
  + `.f{opacity:0;animation:cyc ${(SPIN_FRAMES * SPIN_STEP).toFixed(2)}s step-end infinite}`
  + `@keyframes cyc{0%{opacity:1}${(100 / SPIN_FRAMES).toFixed(2)}%{opacity:0}100%{opacity:0}}`
  + `.spin{animation:out .01s linear forwards}@keyframes out{to{opacity:0;visibility:hidden}}`
  + `.land{opacity:0;transform-box:fill-box;transform-origin:center;animation:land .35s ease-out forwards}`
  + `@keyframes land{0%{opacity:0;transform:scale(1.3)}100%{opacity:1;transform:scale(1)}}`
  + `</style>`;

// Iconos señuelo: se incrustan una vez como <symbol> y cada hueco los reutiliza con <use>.
async function decoySymbols(env, origin, items, prefix, slice = false) {
  const uris = await Promise.all(items.map(x => dataUri(env, origin, x.i)));
  const ids = [];
  let defs = '';
  uris.forEach((uri, i) => {
    if (!uri) return;
    const id = `${prefix}${i}`;
    ids.push(id);
    defs += `<symbol id="${id}" viewBox="0 0 100 100"><image href="${uri}" width="100" height="100"${slice ? ' preserveAspectRatio="xMidYMid slice"' : ''}/></symbol>`;
  });
  return { defs: `<defs>${defs}</defs>`, ids };
}

// Un hueco de la ruleta: los señuelos giran hasta `stopAt` y entonces aparece `final`.
function spinSlot(ids, offset, box, stopAt, final, clip = '') {
  const frames = Array.from({ length: Math.min(SPIN_FRAMES, ids.length) }, (_, k) => ids[(offset + k) % ids.length]);
  const period = SPIN_FRAMES * SPIN_STEP;
  const uses = frames.map((id, k) => `<use class="f" href="#${id}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" style="animation-delay:-${(period - k * SPIN_STEP).toFixed(2)}s"/>`).join('');
  return `<g class="spin" style="animation-delay:${stopAt}s"${clip ? ` clip-path="url(#${clip})"` : ''}>${uses}</g>`
    + `<g class="land" style="animation-delay:${stopAt}s">${final}</g>`;
}

function badge102(x, y) {
  return `<rect x="${x}" y="${y}" width="48" height="22" rx="4" fill="${C.blood}"/><text x="${x + 24}" y="${y + 16}" fill="#fff" font-size="14" font-weight="700" text-anchor="middle">10.2</text>`;
}

// Solo el resultado, sin texto alrededor: el mensaje lo arma cada comando en Leksimus.
function buildMessage(build) {
  const perks = build.perks.map(p => p.n + (p.ch ? ' (10.2)' : '')).join(' · ');
  const adds = build.adds.map(a => a.n).join(' + ');
  if (build.role === 'k') return clip(`${build.killer.n} | ${perks}${adds ? ' | ' + adds : ''}`);
  return clip(`${perks} | ${build.item.n}${adds ? ' + ' + adds : ''}`);
}

async function buildCard(env, origin, build, user, rng, data) {
  const head = build.role === 'k' ? build.killer : build.item;
  const [headIcon, ...icons] = await Promise.all([
    dataUri(env, origin, head.i),
    ...build.perks.map(p => dataUri(env, origin, p.i)),
    ...build.adds.map(a => dataUri(env, origin, a.i)),
  ]);
  const perkIcons = icons.slice(0, build.perks.length);
  const addIcons = icons.slice(build.perks.length);
  const others = (list, taken) => pickMany(list.filter(x => !taken.includes(x)), 12, rng);
  const [perkDecoys, headDecoys, addDecoys] = await Promise.all([
    decoySymbols(env, origin, others(data.perks.filter(p => p.r === build.role), build.perks), 'dp'),
    build.role === 'k'
      ? decoySymbols(env, origin, others(data.chars.filter(c => c.r === 'k'), [build.killer]).slice(0, 8), 'dh', true)
      : decoySymbols(env, origin, others(data.items.filter(i => !i.ev && ITEM_TYPES[i.t]), [build.item]).slice(0, 8), 'dh'),
    decoySymbols(env, origin, others(build.role === 'k' ? data.adds.filter(a => a.kl) : data.adds.filter(a => ITEM_TYPES[a.t]), build.adds).slice(0, 8), 'da'),
  ]);
  const width = 900;
  const height = 450;
  let stop = SPIN_START;
  let body = SPIN_CSS + perkDecoys.defs + headDecoys.defs + addDecoys.defs
    + `<text x="30" y="58" fill="${C.fg}" font-size="34" font-weight="700">${build.role === 'k' ? 'Ruleta de asesino' : 'Ruleta de superviviente'}</text>`
    + `<text x="30" y="88" fill="${C.dim}" font-size="19">${esc(user ? `Build aleatoria para ${user}` : 'Build aleatoria')}</text>`;
  build.perks.forEach((perk, i) => {
    const cx = 120 + i * 220;
    body += diamond(cx, 170, 130, null, 'b' + i);
    let final = `<image href="${perkIcons[i] || ''}" x="${cx - 65}" y="105" width="130" height="130"/>`;
    if (perk.ch) final += badge102(cx + 30, 104);
    wrap(perk.n, 20, 2).forEach((line, j) => {
      final += `<text x="${cx}" y="${262 + j * 23}" fill="${C.fg}" font-size="18" font-weight="600" text-anchor="middle">${esc(line)}</text>`;
    });
    body += spinSlot(perkDecoys.ids, i * 3, { x: cx - 65, y: 105, w: 130, h: 130 }, stop++, final);
  });
  body += `<line x1="30" y1="318" x2="${width - 30}" y2="318" stroke="${C.line}" stroke-width="1.5"/>`;
  // Fila inferior: el objeto (o el retrato del asesino) y sus dos accesorios.
  body += `<clipPath id="kp"><rect x="30" y="336" width="96" height="96" rx="6"/></clipPath><rect x="30" y="336" width="96" height="96" rx="6" fill="${C.panel}"/>`;
  if (build.role === 'k') {
    const final = (headIcon ? `<image href="${headIcon}" x="30" y="336" width="96" height="96" clip-path="url(#kp)" preserveAspectRatio="xMidYMid slice"/>` : '')
      + labelBlock(140, 'Asesino', build.killer.n);
    body += spinSlot(headDecoys.ids, 0, { x: 30, y: 336, w: 96, h: 96 }, stop++, final, 'kp');
  } else {
    const final = square(30, 336, 96, headIcon, build.item.ra, 'it') + labelBlock(140, ITEM_TYPES[build.item.t] || 'Objeto', build.item.n);
    body += spinSlot(headDecoys.ids, 0, { x: 34, y: 340, w: 88, h: 88 }, stop++, final);
  }
  build.adds.forEach((add, i) => {
    const x = 400 + i * 250;
    body += `<rect x="${x}" y="348" width="72" height="72" rx="6" fill="${C.panel}" stroke="${C.line}" stroke-width="2"/>`;
    const final = square(x, 348, 72, addIcons[i], add.ra, 'a' + i) + labelBlock(x + 84, (RARITY[add.ra] || RARITY.common)[1], add.n, 16);
    body += spinSlot(addDecoys.ids, i * 4, { x: x + 4, y: 352, w: 64, h: 64 }, stop++, final);
  });
  return frame(width, height, body);
}

// Personaje al azar: gira el retrato, aparece el nombre y luego sus perks, una por segundo.
async function charSpinCard(env, origin, char, data, eyebrow, rng) {
  const perks = char.p.map(k => data.perkByKey[k]).filter(Boolean);
  const [portrait, ...icons] = await Promise.all([
    dataUri(env, origin, char.i),
    ...perks.map(p => dataUri(env, origin, p.i)),
  ]);
  const decoys = await decoySymbols(env, origin, pickMany(data.chars.filter(c => c.r === char.r && c !== char), 10, rng), 'dc', true);
  let stop = SPIN_START;
  let body = SPIN_CSS + decoys.defs
    + `<clipPath id="pc"><rect x="30" y="30" width="220" height="260" rx="10"/></clipPath>`
    + `<rect x="30" y="30" width="220" height="260" rx="10" fill="${C.panel}"/>`;
  const head = (portrait ? `<image href="${portrait}" x="10" y="40" width="260" height="260" clip-path="url(#pc)" preserveAspectRatio="xMidYMid slice"/>` : '')
    + `<text x="280" y="74" fill="${C.fg}" font-size="38" font-weight="700">${esc(char.n)}</text>`
    + `<text x="280" y="104" fill="${C.dim}" font-size="19">${eyebrow ? esc(eyebrow) + ' · ' : ''}${char.r === 's' ? 'Superviviente' : 'Asesino'}${char.en && char.en !== char.n ? ' · ' + esc(char.en) : ''}</text>`;
  body += `<text x="280" y="74" fill="${C.dim}" font-size="38" font-weight="700" class="spin" style="animation-delay:${stop}s">${char.r === 's' ? 'Ruleta de superviviente' : 'Ruleta de asesino'}</text>`;
  body += spinSlot(decoys.ids, 0, { x: 10, y: 40, w: 260, h: 260 }, stop++, head, 'pc');
  perks.forEach((perk, i) => {
    const cx = 370 + i * 200;
    body += diamond(cx, 182, 120, null, 'c' + i);
    let final = `<image href="${icons[i] || ''}" x="${cx - 60}" y="122" width="120" height="120"/>`;
    wrap(perk.n, 20, 3).forEach((line, j) => {
      final += `<text x="${cx}" y="${266 + j * 24}" fill="${C.fg}" font-size="19" font-weight="600" text-anchor="middle">${esc(line)}</text>`;
    });
    if (perk.ch) final += badge102(cx + 26, 122);
    body += `<g class="land" style="animation-delay:${stop++}s">${final}</g>`;
  });
  return frame(900, 340, body);
}

// --- Perks genéricas (!pj genericas / !pj genericas killer) -----------------

function genericMessage(group) {
  const who = group.role === 'k' ? 'asesino' : 'superviviente';
  return clip(`Perks genéricas de ${who} (${group.perks.length}): ${group.perks.map(p => p.n).join(' · ')}`);
}

function effectMessage(effect) {
  const who = effect.role === 'k' ? ' de asesino' : effect.role === 's' ? ' de superviviente' : '';
  if (!effect.perks.length) return `Ninguna perk${who} menciona ${effect.name}. Puede venir del poder o de los accesorios de algún asesino.`;
  const groups = [['s', 'Survi'], ['k', 'Killer']]
    .map(([r, label]) => [label, effect.perks.filter(p => p.r === r).map(p => p.n)])
    .filter(([, names]) => names.length);
  const head = `Perks con ${effect.name}${who} (${effect.perks.length})`;
  const full = `${head}: ${groups.map(([label, names]) => (effect.role ? '' : label + ': ') + names.join(' · ')).join(' | ')}`;
  if (full.length <= CHAT_MAX) return full;
  // No cabe: cada rol recibe la misma parte del espacio, y se avisa de cuántas faltan y cómo filtrar.
  const tail = effect.role ? '' : ' Añade survi o killer para filtrar.';
  const budget = Math.floor((CHAT_MAX - head.length - tail.length - 20) / groups.length);
  let shown = 0;
  const parts = groups.map(([label, names]) => {
    let part = effect.role ? '' : label + ':';
    for (const name of names) {
      const next = part + (part.endsWith(':') || !part ? ' ' : ' · ') + name;
      if (next.length > budget) break;
      part = next;
      shown++;
    }
    return part.trim();
  });
  return `${head}: ${parts.join(' | ')} … y ${effect.perks.length - shown} más.${tail}`;
}

const EFFECT_CARD_MAX = 15;

async function effectCard(env, origin, effect) {
  const who = effect.role === 'k' ? 'Asesino · ' : effect.role === 's' ? 'Superviviente · ' : '';
  if (!effect.perks.length) {
    const body = `<text x="30" y="62" fill="${C.fg}" font-size="30" font-weight="700">${esc(`Ninguna perk con ${effect.name}`)}</text>`
      + `<text x="30" y="102" fill="${C.dim}" font-size="21">Puede venir del poder o de los accesorios de algún asesino</text>`;
    return frame(900, 140, body);
  }
  const perks = effect.perks.slice(0, EFFECT_CARD_MAX);
  const more = effect.perks.length - perks.length;
  return genericCard(env, origin, {
    perks,
    title: `Perks con ${effect.name}`,
    subtitle: `${who}${effect.perks.length} perks${more ? ` · se muestran ${perks.length}` : ''}`,
  });
}

async function genericCard(env, origin, group) {
  const icons = await Promise.all(group.perks.map(p => dataUri(env, origin, p.i)));
  const perRow = 5;
  const rows = Math.ceil(group.perks.length / perRow);
  const width = 900;
  const height = 110 + rows * 170;
  const title = group.title || 'Perks genéricas';
  const subtitle = group.subtitle || `${group.role === 'k' ? 'Asesino' : 'Superviviente'} · ${group.perks.length} perks que puede usar cualquiera`;
  let body = `<text x="30" y="58" fill="${C.fg}" font-size="34" font-weight="700">${esc(title)}</text>`
    + `<text x="30" y="88" fill="${C.dim}" font-size="19">${esc(subtitle)}</text>`;
  group.perks.forEach((perk, i) => {
    const cx = 105 + (i % perRow) * 172;
    const cy = 165 + Math.floor(i / perRow) * 170;
    body += diamond(cx, cy, 96, icons[i], 'g' + i);
    if (perk.ch) body += `<rect x="${cx + 18}" y="${cy - 52}" width="42" height="20" rx="4" fill="${C.blood}"/><text x="${cx + 39}" y="${cy - 37}" fill="#fff" font-size="13" font-weight="700" text-anchor="middle">10.2</text>`;
    wrap(perk.n, 20, 3).forEach((line, j) => {
      body += `<text x="${cx}" y="${cy + 66 + j * 20}" fill="${C.fg}" font-size="16" font-weight="600" text-anchor="middle">${esc(line)}</text>`;
    });
  });
  return frame(width, height, body);
}
