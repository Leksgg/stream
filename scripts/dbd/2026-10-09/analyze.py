import json,re,unicodedata,sys
D='dl/'
pe=json.load(open(D+'perks_es.json',encoding='utf-8')); pn=json.load(open(D+'perks.json',encoding='utf-8'))
ch=json.load(open(D+'characters_es.json',encoding='utf-8'))
def slug(s):
    s=unicodedata.normalize('NFD',s.lower()); s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    return re.sub(r'[^a-z0-9]','',s)
lines=open('/d/stream/public/txt/dbdperks.txt',encoding='utf-8-sig').read().splitlines() if False else open(sys.argv[1],encoding='utf-8-sig').read().splitlines()
ids={l.split('|')[0].strip().lower():l for l in lines if '|' in l}
names={slug(l.split('|')[1].split(':')[0]) if l.count(':')>=1 else '' for l in lines if '|' in l}
# names including Hex: prefix
names2=set()
for l in lines:
    if '|' in l:
        body=l.split('|',1)[1].strip()
        nm=body.split(' — ')[0]
        # name is before the last ': ' that starts description
        m=re.match(r'(.+?): [A-ZÁÉÍÓÚ¡¿0-9]',body)
        if m: names2.add(slug(m.group(1)))
missing=[];found=0
for k,v in pe.items():
    s=slug(v['name'])
    if s in ids or s in names2: found+=1
    else: missing.append((v['role'],v['name'],pn[k]['name']))
print('total',len(pe),'found',found,'missing',len(missing))
for m in sorted(missing): print(m)
