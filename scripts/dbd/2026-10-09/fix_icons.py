import json,os,urllib.request,urllib.parse,concurrent.futures as cf
d=json.load(open('data.json',encoding='utf-8'))
UA={'User-Agent':'Mozilla/5.0 (stream perk builder; personal use)'}
def api(titles):
    q=urllib.parse.urlencode({'action':'query','titles':'|'.join(titles),'prop':'pageimages','piprop':'name','format':'json','redirects':1,'pilimit':50})
    j=json.load(urllib.request.urlopen(urllib.request.Request('https://deadbydaylight.wiki.gg/api.php?'+q,headers=UA),timeout=30))['query']
    m={t:t for t in titles}
    for r in j.get('normalized',[])+j.get('redirects',[]):
        for t,v in m.items():
            if v==r['from']: m[t]=r['to']
    img={p['title']:p.get('pageimage') for p in j['pages'].values() if 'title' in p}
    return {t:img.get(v) for t,v in m.items()}
def get(f):
    out='icons/'+f
    if os.path.exists(out): return f,'ok'
    try:
        data=urllib.request.urlopen(urllib.request.Request('https://deadbydaylight.wiki.gg/images/'+urllib.parse.quote(f),headers=UA),timeout=30).read()
        if data[:4]!=b'\x89PNG': return f,'notpng'
        open(out,'wb').write(data); return f,'ok'
    except Exception as e: return f,str(e)[:40]
for k in d['killers']:
    k['i']=k['i'].replace('.png.png','.png')
need=[x for g in ['perks','items','adds','addk'] for x in d[g] if not os.path.exists('icons/'+x['i'])]
names=sorted({x['en'] for x in need})
found={}
for i in range(0,len(names),50): found.update(api(names[i:i+50]))
for x in need:
    f=found.get(x['en'])
    if f and not f.startswith('IconHelp'): x['i']=f
files=sorted({x['i'] for g in ['perks','items','adds','addk','killers'] for x in d[g]})
with cf.ThreadPoolExecutor(6) as ex: res=list(ex.map(get,files))
json.dump(d,open('data.json','w',encoding='utf-8'),ensure_ascii=False)
for g in ['perks','killers','items','adds','addk']:
    m=[(x['en'] if 'en' in x else x['n'],x['i']) for x in d[g] if not os.path.exists('icons/'+x['i'])]; print(g,'missing',len(m),m[:8])
