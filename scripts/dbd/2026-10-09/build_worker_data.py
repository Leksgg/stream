import sys,json,os,re,unicodedata,io
sys.path.insert(0,'pylib');sys.path.insert(0,'.')
from PIL import Image
from common import *
OUT='D:/stream/public/dbd'
os.makedirs(OUT+'/icons',exist_ok=True);os.makedirs(OUT+'/pj',exist_ok=True)
def slug(s):
    s=unicodedata.normalize('NFD',str(s).lower()); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z0-9]','',s)
B=json.load(open('data.json',encoding='utf-8'))  # perks with source icon file names
pe=L('perks_es.json');chE=L('characters.json');chS=L('characters_es.json')
sp=json.load(open('surv_portraits.json'))
kp={k['id']:k['i'] for k in B['killers']}
lines=open('D:/stream/public/txt/dbdperks.txt',encoding='utf-8-sig').read().splitlines()
txt={}
for l in lines:
    if '|' not in l: continue
    body=l.split('|',1)[1].strip()
    if ' — ' not in body: continue
    head,char=body.rsplit(' — ',1)
    m=re.match(r'(.+?): (.+)$',head)
    if m and len(m.group(2))>25: txt[slug(m.group(1))]=m.group(2).strip()
# character lines: label | perk — perk — perk
labels=[]
for l in lines:
    if '|' in l:
        lab,body=l.split('|',1); body=body.strip()
        parts=[p.strip() for p in body.split(' — ')]
        if len(parts)>=2 and all(':' not in p or p.startswith(('Maleficio','Bendición','Gancho','Invocación','Trabajo')) for p in parts) and len(body)<200:
            labels.append((slug(lab),{slug(p) for p in parts}))
def save(src,dst,size):
    im=Image.open('icons/'+src).convert('RGBA');im.thumbnail((size,size),Image.LANCZOS);im.save(OUT+'/'+dst,'WEBP',quality=82,method=6)
perks=[];key={}
nofile=0
for p in B['perks']:
    k=slug(p['n'])
    if k in key: k=k+slug(p['en'])
    key[p['id']]=k
    t=p['cd'] if p['ch'] else txt.get(slug(p['n']))
    if not t: nofile+=1; t=p['d'].replace('\n',' ').replace('• ','')
    icon=None
    if p['i'] and os.path.exists('icons/'+p['i']): icon='icons/'+k+'.webp'; save(p['i'],icon,96)
    perks.append(dict(k=k,n=p['n'],en=p['en'],c=p['c'],t=t,ch=p['ch'],i=icon))
chars=[]
STRIP={'the','el','la','los','lo','las'}
for cid,v in chS.items():
    en=chE[cid]['name']; n=v['name']; ps=[key[x] for x in (v['perks'] or []) if x in key]
    al={slug(n),slug(en),slug(v['id'])}
    for nm in (n,en):
        w=[x for x in re.split(r'[\s"]+',nm) if x]
        if w and w[0].lower() in STRIP: al.add(slug(' '.join(w[1:])))
        elif v['role']=='survivor':
            al.update(slug(x) for x in w if len(slug(x))>=3)
    pset={slug(pe[x]['name']) for x in (v['perks'] or [])}
    for lab,ls in labels:
        if len(ls & pset)>=2: al.add(lab)
    al.discard('')
    src=sp.get(cid) if v['role']=='survivor' else kp.get(cid)
    icon=None
    if src and os.path.exists('icons/'+src): icon='pj/'+slug(n)+'.webp'; save(src,icon,160)
    chars.append(dict(k=slug(n),n=n,en=en,r='s' if v['role']=='survivor' else 'k',a=sorted(al),p=ps,i=icon))
data=dict(patch='10.2.0',perks=perks,chars=chars)
json.dump(data,open(OUT+'/data.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
# alias collisions
from collections import defaultdict
own=defaultdict(list)
for c in chars:
    for a in c['a']: own[a].append(c['n'])
print('perks',len(perks),'sin texto corto',nofile,'chars',len(chars),'sin retrato',[c['n'] for c in chars if not c['i']])
print('alias duplicados',{a:v for a,v in own.items() if len(v)>1})
print([ (c['n'],c['a']) for c in chars if c['n'] in ('Jake Park','Ashley J. Williams','La Cerda','Ghoul','El Ghoul','Good Guy','El Xenomorfo')])
