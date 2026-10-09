import json,os,urllib.request,urllib.parse,re
exec(open('fix_icons.py').read().split('for k in d')[0])
src={}
for f in ['perks_es.json','items_es.json','addons_es.json']:
    for k,v in json.load(open('dl/'+f,encoding='utf-8')).items(): src[k]=v['image'].rsplit('/',1)[-1]
for g in ['perks','items','adds','addk']:
    for x in d[g]:
        if os.path.exists('icons/'+x['i']): continue
        core=re.sub(r'^(T_UI_)?(icons?_?)(Addon|Perks|Items)_','',src[x['id']],flags=re.I)
        q=urllib.parse.urlencode({'action':'query','list':'search','srnamespace':6,'srsearch':core,'srlimit':5,'format':'json'})
        j=json.load(urllib.request.urlopen(urllib.request.Request('https://deadbydaylight.wiki.gg/api.php?'+q,headers=UA),timeout=30))
        hits=[h['title'][5:] for h in j['query']['search'] if h['title'][5:].lower().startswith(('iconaddon','iconperks','iconitems','t_ui_icon','icons_addon'))]
        print(x['en'],core,hits[:3])
        for h in hits:
            if get(h.replace(' ','_'))[1]=='ok': x['i']=h.replace(' ','_'); break
json.dump(d,open('data.json','w',encoding='utf-8'),ensure_ascii=False)
print(sum(1 for g in ['perks','items','adds','addk','killers'] for x in d[g] if not os.path.exists('icons/'+x['i'])))
