import json,os,urllib.request,urllib.parse,re,string
exec(open('fix_icons.py').read().split('for k in d')[0])
need=[x for g in ['perks','items','adds','addk'] for x in d[g] if not os.path.exists('icons/'+x['i'])]
def variants(n):
    a=n.replace('’',"'").replace('‘',"'").replace('"','')
    v=[a, string.capwords(a), a[:1]+a[1:].lower(), a.replace('-',' '), string.capwords(a.replace('-',' ')), a.strip()+' (Add-on)', a.strip()+' (Perk)']
    return list(dict.fromkeys(v))
for x in need:
    vs=variants(x['en'])
    r=api(vs)
    for v in vs:
        f=r.get(v)
        if f and not f.startswith('IconHelp'):
            x['i']=f; get(f); break
# killers via allimages prefix
for k in d['killers']:
    if os.path.exists('icons/'+k['i']): continue
    code=re.search(r'(K\d+)_',k['i']).group(1)
    q=urllib.parse.urlencode({'action':'query','list':'allimages','aiprefix':code+'_','ailimit':50,'format':'json'})
    j=json.load(urllib.request.urlopen(urllib.request.Request('https://deadbydaylight.wiki.gg/api.php?'+q,headers=UA),timeout=30))
    c=[i['name'] for i in j['query']['allimages'] if 'ortrait' in i['name']]
    q=urllib.parse.urlencode({'action':'query','list':'allimages','aiprefix':'T_UI_'+code+'_','ailimit':50,'format':'json'})
    j=json.load(urllib.request.urlopen(urllib.request.Request('https://deadbydaylight.wiki.gg/api.php?'+q,headers=UA),timeout=30))
    c+= [i['name'] for i in j['query']['allimages'] if 'ortrait' in i['name']]
    if c: k['i']=c[0]; get(c[0])
    print(k['n'],c[:3])
json.dump(d,open('data.json','w',encoding='utf-8'),ensure_ascii=False)
for g in ['perks','killers','items','adds','addk']:
    m=[(x.get('en',x['n']),x['i']) for x in d[g] if not os.path.exists('icons/'+x['i'])]; print(g,'missing',len(m),m)
