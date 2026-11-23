"""Importa los códigos de DBD desde una copia guardada de https://nightlight.gg/codes.

La web bloquea las peticiones automáticas, así que la página se guarda a mano desde el
navegador (Ctrl+S, «solo HTML») y este script la lee. Cada pasada se suma a lo que ya había:
la página pagina los permanentes y los caducados (9, 18 o 27 por página), así que para
tenerlos todos se guarda una copia por página y se importan todas.

Lee y escribe:
  scripts/dbd/fuentes/codigos.json  registro completo (se conserva el campo `es`, que se rellena a mano)
  public/dbd/codes.json             lo mismo, compacto, para la web y el Worker

Un código nunca se borra del registro. Pasa a caducado cuando la página lo lista en
«Expired Codes»; además, la web y el Worker dan por caducado todo el que tenga la fecha pasada.

Uso:  python -I scripts/dbd/import_codes.py <pagina.html> [más.html ...] [--fecha AAAA-MM-DD]
      --fecha es el día en que se guardó la página (por defecto, la fecha del archivo);
      sirve para poner el año a las fechas que la página muestra sin él.
"""
import argparse, html, json, os, re, sys
from datetime import date, datetime

RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
FUENTE = os.path.join(os.path.dirname(__file__), 'fuentes', 'codigos.json')
PUBLICO = os.path.join(RAIZ, 'public', 'dbd', 'codes.json')
SCHEMA_VERSION = 1
ORIGEN = 'https://nightlight.gg/codes'

MESES = {m: i + 1 for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'])}
SECCIONES = (('time limited', 'limited'), ('never expire', 'permanent'), ('expired codes', 'expired'))


def limpio(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()


def fecha(texto, ref, futura=False):
    """«6 December» o «1 October 27» → ISO. Sin año: el más reciente que no pase de `ref`
    (o, si `futura`, el más cercano a `ref`). Devuelve None si no hay fecha («N/A» o vacío)."""
    m = re.match(r'(\d{1,2}) ([A-Za-z]+)(?: (\d{2,4}))?$', texto.strip())
    if not m or m.group(2).lower() not in MESES:
        return None
    dia, mes = int(m.group(1)), MESES[m.group(2).lower()]
    if m.group(3):
        y = int(m.group(3))
        return date(y + 2000 if y < 100 else y, mes, dia).isoformat()
    cands = []
    for y in (ref.year - 1, ref.year, ref.year + 1):
        try:
            cands.append(date(y, mes, dia))
        except ValueError:  # 29 de febrero
            pass
    if futura:
        return min(cands, key=lambda d: abs((d - ref).days)).isoformat()
    pasadas = [d for d in cands if d <= ref]
    return (max(pasadas) if pasadas else min(cands)).isoformat()


def leer(ruta, ref):
    with open(ruta, encoding='utf-8', errors='replace') as f:
        s = f.read()
    s = re.sub(r'(?s)<(script|style|svg)[^>]*>.*?</\1>', '', s).replace('<!-- -->', '')
    partes = re.split(r'<h[23][^>]*>(.*?)</h[23]>', s)
    out = []
    for i in range(1, len(partes), 2):
        titulo = limpio(partes[i]).lower()
        seccion = next((k for clave, k in SECCIONES if clave in titulo), None)
        if not seccion:
            continue
        for premio, codigo, resto in re.findall(
                r'_title_[^"]*">(.*?)</div>.*?_code_[^"]*">(.*?)</div>(.*?)(?=_title_|$)', partes[i + 1], flags=re.S):
            spans = [limpio(x) for x in re.findall(r'<span[^>]*>(.*?)</span>', resto)]
            alta = next((x[6:] for x in spans if x.startswith('Added:')), '')
            cad = next((re.sub(r'^Expire[sd]:?', '', x) for x in spans if x.startswith('Expire')), '')
            codigo = limpio(codigo)
            if not re.fullmatch(r'[A-Za-z0-9_\-]{2,40}', codigo):
                print('AVISO: código con formato raro, se omite:', repr(codigo[:60]))
                continue
            out.append(dict(
                code=codigo, reward=limpio(premio)[:200],
                kind='permanent' if seccion == 'permanent' else 'limited',
                added=fecha(alta, ref),
                expires=None if seccion == 'permanent' else fecha(cad, ref, futura=seccion == 'limited'),
                expired=seccion == 'expired'))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('paginas', nargs='+', help='copias guardadas de nightlight.gg/codes')
    ap.add_argument('--fecha', help='día en que se guardaron (AAAA-MM-DD); por defecto, la fecha de cada archivo')
    args = ap.parse_args()

    registro = {}
    if os.path.exists(FUENTE):
        with open(FUENTE, encoding='utf-8') as f:
            registro = {c['code']: c for c in json.load(f)['codigos']}
    antes, ultima, nuevos, caducan = len(registro), None, [], []
    for ruta in args.paginas:
        ref = date.fromisoformat(args.fecha) if args.fecha else datetime.fromtimestamp(os.path.getmtime(ruta)).date()
        ultima = max(ultima, ref) if ultima else ref
        leidos = leer(ruta, ref)
        if not leidos:
            sys.exit(f'{ruta}: no se ha encontrado ningún código; ¿ha cambiado el formato de la página?')
        for c in leidos:
            viejo = registro.get(c['code'])
            if not viejo:
                nuevos.append(c['code'])
            elif c['expired'] and not viejo['expired']:
                caducan.append(c['code'])
            if viejo:
                # La página deja en blanco algunas fechas al caducar: no se pisa la que ya se tenía.
                c['expires'] = c['expires'] or (viejo['expires'] if c['kind'] == 'limited' else None)
                c['added'] = c['added'] or viejo['added']
                if viejo.get('es'):
                    c['es'] = viejo['es']
            registro[c['code']] = c

    codigos = sorted(registro.values(), key=lambda c: (c['added'] or '', c['code']), reverse=True)
    with open(FUENTE, 'w', encoding='utf-8') as f:
        json.dump({'_nota': 'Registro de códigos de DBD. Lo escribe import_codes.py; a mano solo se rellena `es` (premio en español).',
                   'origen': ORIGEN, 'actualizado': ultima.isoformat(), 'codigos': codigos}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(PUBLICO, 'w', encoding='utf-8') as f:
        json.dump({'schemaVersion': SCHEMA_VERSION, 'updated': ultima.isoformat(), 'source': ORIGEN, 'codes': codigos},
                  f, ensure_ascii=False, separators=(',', ':'))
    n = lambda cond: sum(1 for c in codigos if cond(c))
    print(f"códigos {len(codigos)} (antes {antes}) · temporales {n(lambda c: c['kind'] == 'limited' and not c['expired'])} · "
          f"permanentes {n(lambda c: c['kind'] == 'permanent')} · caducados {n(lambda c: c['expired'])}")
    if nuevos:
        print('nuevos:', ', '.join(nuevos))
    if caducan:
        print('pasan a caducados:', ', '.join(caducan))


if __name__ == '__main__':
    main()
