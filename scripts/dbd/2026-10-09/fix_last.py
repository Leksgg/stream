import sys,json,os,io,base64,re,unicodedata
sys.path.insert(0,'pylib')
from PIL import Image
exec(open('fix_icons.py').read().split('for k in d')[0])  # get()
FILES={"Friends ‘Til the End":'IconPerks_friendsTilTheEnd.png','Light-footed':'IconPerks_light-Footed.png','Begrimed Chains':'IconAddon_begrimedChains.png','Lo Pro Chains':'IconAddon_loProChains.png','Garish Makeup Kit':'IconAddon_garishMake-UpKit.png','Headline Cutouts':'IconAddon_headlineCut-Outs.png','Kanai-anzen Talisman':'IconAddon_kanai-AnzenTalisman.png','Blonde Hair':'IconAddon_blondHair.png','Anniversary Med-kit':'IconItems_anniversaryMedKit.png','Magnetized Manacles':'T_UI_iconAddon_MagnetisedManacles.png'}
for f in FILES.values(): print(f,get(f)[1])
def slug(s):
    s=unicodedata.normalize('NFD',str(s).lower()); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z0-9]','',s)
def webp(f,size):
    im=Image.open('icons/'+f).convert('RGBA');im.thumbnail((size,size),Image.LANCZOS);b=io.BytesIO();im.save(b,'WEBP',quality=82,method=6);return b.getvalue()
B=json.load(open('data.json',encoding='utf-8'));BD=json.load(open('builder_data.json',encoding='utf-8'))
sizes={'perks':96,'items':72,'adds':64,'addk':64}
fixed=[]
for g,s in sizes.items():
    for src in (B[g],BD[g]):
        for x in src:
            f=FILES.get(x.get('en'))
            if f and (not x.get('i') or not os.path.exists('icons/'+x['i'])):
                x['i']=f; BD['icons'][f]='data:image/webp;base64,'+base64.b64encode(webp(f,s)).decode(); fixed.append((g,x['id']))
json.dump(B,open('data.json','w',encoding='utf-8'),ensure_ascii=False)
json.dump(BD,open('builder_data.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
# worker
P='D:/stream/public/dbd/data.json';W=json.load(open(P,encoding='utf-8'))
wp={p['n']:p for p in W['perks']}
n=0
for x in B['perks']:
    f=FILES.get(x['en'])
    if f:
        p=wp[x['n']];p['i']='icons/'+p['k']+'.webp';open('D:/stream/public/dbd/'+p['i'],'wb').write(webp(f,96));n+=1
wa={a['k']:a for a in W['items']+W['adds']}
for g in ['items','adds','addk']:
    for x in B[g] if g!='items' else BD['items']:
        f=FILES.get(x.get('en'))
        if f:
            a=wa.get(slug(x['id']))
            if a: a['i']='items/'+a['k']+'.webp';open('D:/stream/public/dbd/'+a['i'],'wb').write(webp(f,80));n+=1
            else: print('no worker key',x['id'])
json.dump(W,open(P,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print('fixed builder',len(set(fixed)),'worker',n)
print('worker sin icono',[x['n'] for x in W['perks']+W['items']+W['adds'] if not x.get('i')])
