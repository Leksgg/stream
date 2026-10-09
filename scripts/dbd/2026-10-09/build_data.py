import sys,json,os,re,concurrent.futures as cf,urllib.request
sys.path.insert(0,'.');from common import *
pe=L('perks_es.json');pn=L('perks.json');ie=L('items_es.json');ine=L('items.json');ae=L('addons_es.json');ane=L('addons.json');ch=L('characters_es.json')
chg=json.load(open('changes_es.json',encoding='utf-8'))
RENAMED={'SoleSurvivor':'Down to the Last','ObjectOfObsession':'Bound by Obsession'}
icons={}
def ic(path):
    b=path.rsplit('/',1)[-1]; f=b[0].upper()+b[1:]+'.png'; icons[f]=1; return f
def cname(c):
    return ch[str(c)]['name'] if c is not None and str(c) in ch else None
perks=[]
for k,v in pe.items():
    d=plain(render(v['description'],v['tunables']))
    c=chg.get(k)
    char=cname(v['character'])
    if k=='SoleSurvivor': char=None
    perks.append(dict(id=k,n=v['name'],en=RENAMED.get(k,pn[k]['name']),r='s' if v['role']=='survivor' else 'k',c=char,d=d,ch=(c[0] if c else None),cd=(c[1] if c else None),i=ic(v['image'])))
killers=[];addk=[]
for cid,v in ch.items():
    if v['role']!='killer': continue
    killers.append(dict(id=cid,n=v['name'],p=v['item'],i=ic(v['image'])))
for k,v in ae.items():
    if v['role']=='killer' and v['parents'] and v['bloodweb']==1:
        addk.append(dict(id=k,n=v['name'],en=ane[k]['name'],p=v['parents'][0],ra=v['rarity'],d=plain(render(v['description'],v.get('modifiers') and {} )),i=ic(v['image'])))
items=[];adds=[]
for k,v in ie.items():
    if v['role']=='survivor' and v['item_type'] in ('toolbox','medkit','flashlight','map','key','fogvial') and (v['bloodweb'] or v['event']):
        items.append(dict(id=k,n=v['name'],en=ine[k]['name'],t=v['item_type'],ra=v['rarity'],ev=v['event'],d=plain(v['description']),i=ic(v['image'])))
for k,v in ae.items():
    if v['role']=='survivor' and v['item_type']:
        adds.append(dict(id=k,n=v['name'],en=ane[k]['name'],t=v['item_type'],ra=v['rarity'],d=plain(render(v['description'],None)),i=ic(v['image'])))
pw={x['p'] for x in killers}; 
from collections import Counter
cnt=Counter(a['p'] for a in addk); print('killers',len(killers),'addons per killer min/max',min(cnt.get(p,0) for p in pw),max(cnt.values()))
print([x['n'] for x in killers if cnt.get(x['p'],0)!=20])
print('perks',len(perks),'changed',sum(1 for p in perks if p['ch']),'items',len(items),'surv addons',len(adds),'killer addons',len(addk),'icons',len(icons))
json.dump(dict(perks=perks,killers=killers,addk=addk,items=items,adds=adds),open('data.json','w',encoding='utf-8'),ensure_ascii=False)
os.makedirs('icons',exist_ok=True)
def get(f):
    out='icons/'+f
    if os.path.exists(out) and os.path.getsize(out)>200: return f,'ok'
    try:
        req=urllib.request.Request('https://deadbydaylight.wiki.gg/images/'+urllib.request.quote(f),headers={'User-Agent':'Mozilla/5.0 (stream perk builder; personal use)'})
        data=urllib.request.urlopen(req,timeout=30).read()
        if data[:4]!=b'\x89PNG': return f,'notpng'
        open(out,'wb').write(data); return f,'ok'
    except Exception as e: return f,str(e)[:60]
with cf.ThreadPoolExecutor(6) as ex:
    res=list(ex.map(get,icons))
bad=[r for r in res if r[1]!='ok']; print('failed',len(bad)); print(bad[:40])
