"""Genera los datos de Dead by Daylight que sirve el Worker, desde una sola fuente.

Salidas (en public/dbd/ salvo que se pase --salida):
  data.json     comandos del bot (!perk, !pj, sorteos): claves k, texto corto t, alias de personaje
  builder.json  herramienta Builds DBD de digitalbite.net: descripciones completas, ids del juego

Fuentes (scripts/dbd/fuentes/):
  dl/                 descarga de dbd.tricky.lol (es + en)
  changes_es.json     cambios del último parche, a mano: {id: [tipo, texto]}
  ajustes.json        correcciones que tricky no trae (nombres nuevos, perks sin personaje, apodos de !pj, parche)
  iconos_wiki.json    archivo de deadbydaylight.wiki.gg de cada icono, por grupo e id
  surv_portraits.json retrato de la wiki de cada superviviente
  public/txt/dbdperks.txt  textos cortos de las perks para el chat

Si falta un WebP en public/dbd, se descarga de la wiki y se convierte (necesita `pip install pillow`).

Uso:  python -I scripts/dbd/generate.py [--salida DIR]
"""
import argparse, html, json, os, re, sys, unicodedata, urllib.parse, urllib.request
from datetime import datetime, timezone

RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
FUENTES = os.path.join(os.path.dirname(__file__), 'fuentes')
PUBLIC = os.path.join(RAIZ, 'public', 'dbd')
SCHEMA_VERSION = 1

ITEM_TYPES = ('toolbox', 'medkit', 'flashlight', 'map', 'key', 'fogvial', 'firecracker')
ICON_SIZE = {'icons': 96, 'pj': 160, 'items': 80}

# Efectos de estado: se detectan en la descripción (sin tildes; con mayúscula, como los escribe el juego).
FX = [
    ('Celeridad', r'Celeridad'), ('Entorpecimiento', r'Entorpecimiento'), ('Agotamiento', r'Agotamiento|[Aa]gotado'),
    ('Resistencia', r'Resistencia'), ('Quebranto', r'Quebranto'), ('Esquiva', r'Esquiva'),
    ('Indetectable', r'Indetectable'), ('Ceguera', r'Ceguera'), ('Inconsciencia', r'Inconsciencia'),
    ('Hemorragia', r'Hemorragia'), ('Laceración', r'Laceracion'), ('Vulnerabilidad', r'Vulnerabilidad'),
    ('Herida profunda', r'[Hh]erida profunda'), ('Incapacitación', r'Incapacitacion'), ('Desesperanza', r'Desesperanza'),
    ('Debilidad', r'Debilidad'), ('Sed de sangre', r'Sed de sangre'), ('Gritar', r'[Gg]rit(a|o)'), ('Auras', r'\bauras?\b'),
]
FX = [(name, re.compile(rx)) for name, rx in FX]

KW_ES = {'haste': 'Celeridad', 'exhausted': 'Agotamiento', 'broken': 'Quebranto', 'exposed': 'Vulnerabilidad',
         'undetectable': 'Indetectable', 'oblivious': 'Inconsciencia', 'endurance': 'Resistencia',
         'hindered': 'Entorpecimiento', 'blindness': 'Ceguera', 'elusive': 'Esquiva', 'hemorrhage': 'Hemorragia',
         'mangled': 'Laceración', 'deepwound': 'Herida profunda'}


def slug(s):
    s = unicodedata.normalize('NFD', str(s).lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]', '', s)


def unacc(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')


def fmt(v):
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def render(desc, tun):
    """Sustituye los marcadores de tricky ({Tunable.x}, {Keyword.x}, {Input.x})."""
    if not desc:
        return ''
    tun = {k.lower(): v for k, v in (tun or {}).items()}

    def tunable(m):
        key = m.group(1).split('.')[-1].lower()
        v = tun.get(key) or tun.get(key.rstrip('%')) or tun.get(key + '%')
        if v is None:
            return '?'
        return '/'.join(fmt(x) for x in v) if isinstance(v, list) else fmt(v)
    s = re.sub(r'\{Tunable\.([^}]*)\}', tunable, desc)
    s = re.sub(r'\{Keyword\.([^}]*)\}', lambda m: KW_ES.get(m.group(1).lower(), m.group(1)), s)
    return re.sub(r'\{Input\.[^}]*\}', '[botón de habilidad]', s)


def plain(s):
    s = re.sub(r'<li>', '• ', s)
    s = re.sub(r'<br\s*/?>|</li>|</?ul>', '\n', s)
    s = html.unescape(re.sub(r'<[^>]+>', '', s))
    return re.sub(r'\n{2,}', '\n', s).strip()


def fx_of(*texts):
    t = unacc(' '.join(x or '' for x in texts))
    return [name for name, rx in FX if rx.search(t)]


def load(name):
    with open(os.path.join(FUENTES, name), encoding='utf-8') as f:
        return json.load(f)


def short_texts():
    """Textos cortos de dbdperks.txt ("Nombre: texto — personaje") y líneas de personaje ("alias | perk — perk")."""
    with open(os.path.join(RAIZ, 'public', 'txt', 'dbdperks.txt'), encoding='utf-8-sig') as f:
        lines = f.read().splitlines()
    txt, labels = {}, []
    for line in lines:
        if '|' not in line:
            continue
        label, body = line.split('|', 1)
        body = body.strip()
        if ' — ' in body:
            head = body.rsplit(' — ', 1)[0]
            m = re.match(r'(.+?): (.+)$', head)
            if m and len(m.group(2)) > 25:
                txt[slug(m.group(1))] = m.group(2).strip()
        parts = [p.strip() for p in body.split(' — ')]
        if len(parts) >= 2 and len(body) < 200 and all(
                ':' not in p or p.startswith(('Maleficio', 'Bendición', 'Gancho', 'Invocación', 'Trabajo')) for p in parts):
            labels.append((slug(label), {slug(p) for p in parts}))
    return txt, labels


class Icons:
    """Asegura que cada WebP existe en public/dbd; si falta, lo baja de la wiki y lo convierte."""

    def __init__(self, out):
        self.out = out
        self.missing = []

    def ensure(self, path, wiki_file):
        dst = os.path.join(PUBLIC, path)
        if os.path.exists(dst):
            return path
        if not wiki_file:
            self.missing.append(path)
            return None
        try:
            from PIL import Image  # solo hace falta si hay que crear iconos nuevos
            import io
            req = urllib.request.Request('https://deadbydaylight.wiki.gg/images/' + urllib.parse.quote(wiki_file),
                                         headers={'User-Agent': 'Mozilla/5.0 (Digital Bite DBD data)'})
            data = urllib.request.urlopen(req, timeout=30).read()
            im = Image.open(io.BytesIO(data)).convert('RGBA')
            size = ICON_SIZE[path.split('/')[0]]
            im.thumbnail((size, size), Image.LANCZOS)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im.save(dst, 'WEBP', quality=82, method=6)
            print('icono nuevo:', path, '<-', wiki_file)
            return path
        except Exception as e:  # sin red, sin Pillow o archivo inexistente en la wiki
            self.missing.append(f'{path} ({wiki_file}: {str(e)[:60]})')
            return None


def build(icons):
    pe, pn = load('dl/perks_es.json'), load('dl/perks.json')
    ie, ine = load('dl/items_es.json'), load('dl/items.json')
    ae, ane = load('dl/addons_es.json'), load('dl/addons.json')
    chS, chE = load('dl/characters_es.json'), load('dl/characters.json')
    changes, adj, wiki, surv = load('changes_es.json'), load('ajustes.json'), load('iconos_wiki.json'), load('surv_portraits.json')
    txt, labels = short_texts()

    def char_name(c):
        return chS[str(c)]['name'] if c is not None and str(c) in chS else None

    # --- Perks -------------------------------------------------------------
    perks, perk_key, used_keys = [], {}, set()
    for pid, v in pe.items():
        k = slug(v['name'])
        if k in used_keys:
            k += slug(pn[pid]['name'])
        used_keys.add(k)
        perk_key[pid] = k
        ch = changes.get(pid)
        perks.append(dict(
            id=pid, k=k, n=v['name'], en=adj['nombreIngles'].get(pid, pn[pid]['name']),
            r='s' if v['role'] == 'survivor' else 'k',
            c=None if pid in adj['sinPersonaje'] else char_name(v['character']),
            d=plain(render(v['description'], v['tunables'])),
            ch=ch[0] if ch else None, cd=ch[1] if ch else None,
            i=icons.ensure(f'icons/{k}.webp', wiki['perks'].get(pid)),
        ))
    for p in perks:
        p['fx'] = fx_of(p['d'], p['cd'])

    # --- Asesinos ----------------------------------------------------------
    killers = [dict(id=cid, n=v['name'], en=chE[cid]['name'], p=v['item'],
                    i=icons.ensure(f'pj/{slug(v["name"])}.webp', wiki['killers'].get(cid)))
               for cid, v in chS.items() if v['role'] == 'killer']
    killer_by_power = {k['p']: k for k in killers}

    # --- Objetos y accesorios ----------------------------------------------
    item_keys = set()

    def item_key(base):
        k, n = base, 2
        while k in item_keys:
            k, n = f'{base}{n}', n + 1
        item_keys.add(k)
        return k

    items = []
    for iid, v in sorted(ie.items(), key=lambda kv: kv[1]['item_type'] == 'firecracker'):
        # Los petardos entran todos (el Flashbang sale de una perk, no del bloodweb) y van al final.
        if v['role'] == 'survivor' and v['item_type'] in ITEM_TYPES and (v['bloodweb'] or v['event'] or v['item_type'] == 'firecracker'):
            k = item_key(slug(iid))
            items.append(dict(id=iid, k=k, n=v['name'], en=ine[iid]['name'], t=v['item_type'], ra=v['rarity'], ev=v['event'],
                              d=plain(v['description']), i=icons.ensure(f'items/{k}.webp', wiki['items'].get(iid))))
    adds, addk = [], []
    for aid, v in ae.items():
        if v['role'] == 'survivor' and v['item_type']:
            k = item_key(slug(aid))
            d = plain(render(v['description'], None))
            adds.append(dict(id=aid, k=k, n=v['name'], en=ane[aid]['name'], t=v['item_type'], ra=v['rarity'], d=d,
                             fx=fx_of(d), i=icons.ensure(f'items/{k}.webp', wiki['adds'].get(aid))))
    for aid, v in ae.items():
        if v['role'] == 'killer' and v['parents'] and v['bloodweb'] == 1:
            k = item_key(slug(aid))
            d = plain(render(v['description'], None))
            addk.append(dict(id=aid, k=k, n=v['name'], en=ane[aid]['name'], p=v['parents'][0], ra=v['rarity'], d=d,
                             fx=fx_of(d), i=icons.ensure(f'items/{k}.webp', wiki['addk'].get(aid))))

    # --- Personajes (solo bot) ---------------------------------------------
    strip = {'the', 'el', 'la', 'los', 'lo', 'las'}
    chars = []
    for cid, v in chS.items():
        en, n = chE[cid]['name'], v['name']
        aliases = {slug(n), slug(en), slug(v['id'])}
        for name in (n, en):
            words = [x for x in re.split(r'[\s"]+', name) if x]
            if words and words[0].lower() in strip:
                aliases.add(slug(' '.join(words[1:])))
            elif v['role'] == 'survivor':
                aliases.update(slug(x) for x in words if len(slug(x)) >= 3)
        perk_names = {slug(pe[x]['name']) for x in (v['perks'] or [])}
        for label, names in labels:
            if len(names & perk_names) >= 2:
                aliases.add(label)
        aliases.update(adj['aliasExtra'].get(slug(n), []))
        aliases.discard('')
        src = surv.get(cid) if v['role'] == 'survivor' else wiki['killers'].get(cid)
        chars.append(dict(k=slug(n), n=n, en=en, r='s' if v['role'] == 'survivor' else 'k', a=sorted(aliases),
                          p=[perk_key[x] for x in (v['perks'] or []) if x in perk_key],
                          i=icons.ensure(f'pj/{slug(n)}.webp', src)))

    # --- Salidas -----------------------------------------------------------
    bot = dict(
        patch=adj['patch'],
        perks=[dict(k=p['k'], n=p['n'], en=p['en'], c=p['c'],
                    t=p['cd'] if p['ch'] else txt.get(slug(p['n'])) or p['d'].replace('\n', ' ').replace('• ', ''),
                    ch=p['ch'], i=p['i'], r=p['r'], **({'fx': p['fx']} if p['fx'] else {})) for p in perks],
        chars=chars,
        items=[dict(k=x['k'], n=x['n'], t=x['t'], ra=x['ra'], ev=bool(x['ev']), i=x['i']) for x in items],
        adds=[dict(k=x['k'], n=x['n'], t=x['t'], ra=x['ra'], i=x['i']) for x in adds]
        + [dict(k=x['k'], n=x['n'], kl=slug(killer_by_power[x['p']]['n']), ra=x['ra'], i=x['i']) for x in addk],
    )
    drop = lambda x, *keys: {a: b for a, b in x.items() if a not in keys}
    builder = dict(
        schemaVersion=SCHEMA_VERSION, patch=adj['patch'], date=adj['date'],
        generated=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        perks=[drop(p, 'k') for p in perks], killers=killers,
        items=[drop(x, 'k') for x in items], adds=[drop(x, 'k') for x in adds], addk=[drop(x, 'k') for x in addk],
    )
    return bot, builder


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--salida', default=PUBLIC, help='carpeta donde escribir data.json y builder.json')
    args = ap.parse_args()
    icons = Icons(args.salida)
    bot, builder = build(icons)
    os.makedirs(args.salida, exist_ok=True)
    for name, data in (('data.json', bot), ('builder.json', builder)):
        with open(os.path.join(args.salida, name), 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f"perks {len(builder['perks'])} · asesinos {len(builder['killers'])} · objetos {len(builder['items'])} · "
          f"accesorios {len(builder['adds'])}+{len(builder['addk'])} · personajes {len(bot['chars'])}")
    if icons.missing:
        print('SIN ICONO:', *icons.missing, sep='\n  ')
        sys.exit(1)


if __name__ == '__main__':
    main()
