import sys,json,os,re,unicodedata
sys.path.insert(0,'pylib')
from PIL import Image
OUT='D:/stream/public/dbd'
os.makedirs(OUT+'/items',exist_ok=True)
def slug(s):
    s=unicodedata.normalize('NFD',str(s).lower()); s=''.join(c for c in s if unicodedata.category(c)!='Mn'); return re.sub(r'[^a-z0-9]','',s)
B=json.load(open('data.json',encoding='utf-8'))      # builder data (source icon names, killers with power p)
BD=json.load(open('builder_data.json',encoding='utf-8'))  # includes firecrackers
W=json.load(open(OUT+'/data.json',encoding='utf-8'))
chS=json.load(open('dl/characters_es.json',encoding='utf-8'))
def save(src,key):
    if not src or not os.path.exists('icons/'+src): return None
    dst='items/'+key+'.webp'
    im=Image.open('icons/'+src).convert('RGBA');im.thumbnail((80,80),Image.LANCZOS);im.save(OUT+'/'+dst,'WEBP',quality=82,method=6);return dst
items=[];used=set()
def uk(base):
    k=base;n=2
    while k in used: k=f'{base}{n}';n+=1
    used.add(k);return k
for x in BD['items']:
    k=uk(slug(x['id']));items.append(dict(k=k,n=x['n'],t=x['t'],ra=x['ra'],ev=bool(x['ev']),i=save(x['i'],k)))
adds=[]
for x in B['adds']:
    k=uk(slug(x['id']));adds.append(dict(k=k,n=x['n'],t=x['t'],ra=x['ra'],i=save(x['i'],k)))
kslug={c['id']:slug(c['n']) for c in B['killers']}
power={c['p']:slug(c['n']) for c in B['killers']}
for x in B['addk']:
    k=uk(slug(x['id']));adds.append(dict(k=k,n=x['n'],kl=power[x['p']],ra=x['ra'],i=save(x['i'],k)))
W['items']=items;W['adds']=adds
json.dump(W,open(OUT+'/data.json','w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print(len(items),len(adds),'sin icono',sum(1 for a in items+adds if not a['i']))
ks={c['k'] for c in W['chars'] if c['r']=='k'}; print('killers sin addons',[k for k in ks if not any(a.get('kl')==k for a in adds)])
