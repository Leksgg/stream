import json,os,urllib.request,urllib.parse
exec(open('fix_icons.py').read().split('for k in d')[0])
src={}
for f in ['perks_es.json','items_es.json','addons_es.json']:
    for k,v in json.load(open('dl/'+f,encoding='utf-8')).items(): src[k]=v['image'].rsplit('/',1)[-1]
n=0
for g in ['perks','items','adds','addk']:
    for x in d[g]:
        if os.path.exists('icons/'+x['i']): continue
        b=src[x['id']]; core=b.replace('T_UI_','').replace('iconAddon_','').replace('iconPerks_','').replace('iconItems_','')
        pre='IconAddon_' if 'ddon' in b else 'IconPerks_' if 'erks' in b else 'IconItems_'
        cands=[b+'.png', b[0].upper()+b[1:]+'.png', pre+core+'.png', pre+core[0].lower()+core[1:]+'.png', pre+core[0].upper()+core[1:]+'.png', pre+core.lower()+'.png']
        for c in dict.fromkeys(cands):
            if get(c)[1]=='ok': x['i']=c; n+=1; break
print('fixed',n)
json.dump(d,open('data.json','w',encoding='utf-8'),ensure_ascii=False)
for g in ['perks','items','adds','addk']:
    m=[x.get('en') for x in d[g] if not os.path.exists('icons/'+x['i'])]; print(g,len(m),m)
