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
      return svg ? svgResponse(await buildCard(env, url.origin, build, user)) : text(buildMessage(build, user));
    }
    const role = kind === 'random/survi' ? 's' : 'k';
    const pool = data.chars.filter(c => c.r === role);
    const char = pool[Math.floor(rng() * pool.length)];
    const eyebrow = user ? `Te toca, ${user}` : 'Te toca';
    if (svg) return svgResponse(await charCard(env, url.origin, char, data, eyebrow));
    const names = char.p.map(k => data.perkByKey[k]?.n).filter(Boolean);
    return text(clip(`${user ? user + ', te toca' : 'Te toca'}: ${char.n} (${names.join(' · ')})`));
  }

  const result = kind === 'perk' ? findPerk(data, query) : findChar(data, query);

  if (result.generic) {
    return svg ? svgResponse(await genericCard(env, url.origin, result.generic)) : text(genericMessage(result.generic));
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

function findPerk(data, query) {
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

function buildMessage(build, user) {
  const perks = build.perks.map(p => p.n + (p.ch ? ' (10.2)' : '')).join(' · ');
  const adds = build.adds.map(a => a.n).join(' + ');
  const who = user ? `Build para ${user}` : 'Build aleatoria';
  if (build.role === 'k') return clip(`${who} con ${build.killer.n}: ${perks} | Accesorios: ${adds}`);
  return clip(`${who}: ${perks} | Objeto: ${build.item.n}${adds ? ' + ' + adds : ''}`);
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

async function buildCard(env, origin, build, user) {
  const head = build.role === 'k' ? build.killer : build.item;
  const [headIcon, ...icons] = await Promise.all([
    dataUri(env, origin, head.i),
    ...build.perks.map(p => dataUri(env, origin, p.i)),
    ...build.adds.map(a => dataUri(env, origin, a.i)),
  ]);
  const perkIcons = icons.slice(0, build.perks.length);
  const addIcons = icons.slice(build.perks.length);
  const width = 900;
  const height = 450;
  const title = build.role === 'k' ? build.killer.n : 'Superviviente';
  let body = `<text x="30" y="58" fill="${C.fg}" font-size="34" font-weight="700">${esc(title)}</text>`
    + `<text x="30" y="88" fill="${C.dim}" font-size="19">${esc(user ? `Build aleatoria para ${user}` : 'Build aleatoria')}</text>`;
  build.perks.forEach((perk, i) => {
    const cx = 120 + i * 220;
    body += diamond(cx, 170, 130, perkIcons[i], 'b' + i);
    if (perk.ch) body += `<rect x="${cx + 30}" y="104" width="48" height="22" rx="4" fill="${C.blood}"/><text x="${cx + 54}" y="120" fill="#fff" font-size="14" font-weight="700" text-anchor="middle">10.2</text>`;
    wrap(perk.n, 20, 2).forEach((line, j) => {
      body += `<text x="${cx}" y="${262 + j * 23}" fill="${C.fg}" font-size="18" font-weight="600" text-anchor="middle">${esc(line)}</text>`;
    });
  });
  body += `<line x1="30" y1="318" x2="${width - 30}" y2="318" stroke="${C.line}" stroke-width="1.5"/>`;
  // Fila inferior: el objeto (o el retrato del asesino) y sus dos accesorios.
  if (build.role === 'k') {
    body += `<clipPath id="kp"><rect x="30" y="336" width="96" height="96" rx="6"/></clipPath><rect x="30" y="336" width="96" height="96" rx="6" fill="${C.panel}"/>`
      + (headIcon ? `<image href="${headIcon}" x="30" y="336" width="96" height="96" clip-path="url(#kp)" preserveAspectRatio="xMidYMid slice"/>` : '');
    body += labelBlock(140, 'Asesino', build.killer.n);
  } else {
    body += square(30, 336, 96, headIcon, build.item.ra, 'it');
    body += labelBlock(140, ITEM_TYPES[build.item.t] || 'Objeto', build.item.n);
  }
  build.adds.forEach((add, i) => {
    const x = 400 + i * 250;
    body += square(x, 348, 72, addIcons[i], add.ra, 'a' + i);
    body += labelBlock(x + 84, (RARITY[add.ra] || RARITY.common)[1], add.n, 16);
  });
  return frame(width, height, body);
}

// --- Perks genéricas (!pj genericas / !pj genericas killer) -----------------

function genericMessage(group) {
  const who = group.role === 'k' ? 'asesino' : 'superviviente';
  return clip(`Perks genéricas de ${who} (${group.perks.length}): ${group.perks.map(p => p.n).join(' · ')}`);
}

async function genericCard(env, origin, group) {
  const icons = await Promise.all(group.perks.map(p => dataUri(env, origin, p.i)));
  const perRow = 5;
  const rows = Math.ceil(group.perks.length / perRow);
  const width = 900;
  const height = 110 + rows * 170;
  let body = `<text x="30" y="58" fill="${C.fg}" font-size="34" font-weight="700">Perks genéricas</text>`
    + `<text x="30" y="88" fill="${C.dim}" font-size="19">${group.role === 'k' ? 'Asesino' : 'Superviviente'} · ${group.perks.length} perks que puede usar cualquiera</text>`;
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
