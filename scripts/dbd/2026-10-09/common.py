import json,re,html
D=__import__('os').path.join(__import__('os').path.dirname(__file__),'dl')+'/'
def L(n): return json.load(open(D+n,encoding='utf-8'))
KW_ES={'haste':'Celeridad','exhausted':'Agotamiento','broken':'Quebranto','exposed':'Vulnerabilidad','undetectable':'Indetectable','oblivious':'Inconsciencia','endurance':'Resistencia','hindered':'Entorpecimiento','blindness':'Ceguera','elusive':'Esquiva','hemorrhage':'Hemorragia','mangled':'Laceración','deepwound':'Herida profunda'}
KW_EN={k:k.capitalize() for k in KW_ES}; KW_EN['deepwound']='Deep Wound'
def fmt(v):
    if isinstance(v,float) and v.is_integer(): v=int(v)
    return str(v)
def render(desc,tun,es=True):
    if not desc: return ''
    tun={k.lower():v for k,v in (tun or {}).items()}
    def t(m):
        key=m.group(1).split('.')[-1].lower()
        v=tun.get(key) or tun.get(key.rstrip('%')) or tun.get(key+'%')
        if v is None: return '?'
        if isinstance(v,list): return '/'.join(fmt(x) for x in v)
        return fmt(v)
    s=re.sub(r'\{Tunable\.([^}]*)\}',t,desc)
    s=re.sub(r'\{Keyword\.([^}]*)\}',lambda m:(KW_ES if es else KW_EN).get(m.group(1).lower(),m.group(1)),s)
    s=re.sub(r'\{Input\.[^}]*\}','[botón de habilidad]' if es else '[ability button]',s)
    return s
def plain(s):
    s=re.sub(r'<li>','• ',s); s=re.sub(r'<br\s*/?>|</li>|</?ul>','\n',s); s=re.sub(r'<[^>]+>','',s)
    s=html.unescape(s); s=re.sub(r'\n{2,}','\n',s); return s.strip()
