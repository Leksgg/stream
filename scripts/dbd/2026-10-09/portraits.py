import json,os,re,urllib.request,urllib.parse
exec(open('fix_icons.py').read().split('for k in d')[0])
ch=json.load(open('dl/characters_es.json',encoding='utf-8'))
res={}
for cid,v in ch.items():
    if v['role']!='survivor': continue
    b=v['image'].rsplit('/',1)[-1]
    f=b if b.endswith('.png') else b+'.png'
    if get(f)[1]!='ok':
        code=re.match(r'(?:T_UI_)?(S\d+)_',b).group(1)
        q=urllib.parse.urlencode({'action':'query','list':'allimages','aiprefix':code+'_','ailimit':50,'format':'json'})
        j=json.load(urllib.request.urlopen(urllib.request.Request('https://deadbydaylight.wiki.gg/api.php?'+q,headers=UA),timeout=30))
        c=[i['name'] for i in j['query']['allimages'] if i['name'].endswith('_Portrait.png')]
        f=c[0] if c and get(c[0])[1]=='ok' else None
    res[cid]=f
json.dump(res,open('surv_portraits.json','w'),indent=0)
print(len(res),'missing',[ch[k]['name'] for k,v in res.items() if not v])
