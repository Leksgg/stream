import json,re,os,base64
h=open('builder_src.html',encoding='utf-8').read()
s=open('builder_data.json',encoding='utf-8').read().replace('</','<\/')
open('builds-dbd.html','w',encoding='utf-8').write(h.replace('/*DATA*/',s))
OUT='D:/Builds DBD'
css=re.search(r'<style>\n(.*?)</style>',h,re.S).group(1)
js=re.search(r'<script>\n(.*?)</script>',h,re.S).group(1).replace("const D=JSON.parse(document.getElementById('data').textContent);","const D=window.DBD_DATA;")
d=json.loads(open('builder_data.json',encoding='utf-8').read())
icons={};used=set()
for f,uri in d['icons'].items():
    base=re.sub(r'[^A-Za-z0-9_.-]','_',f.rsplit('.',1)[0]);name=base;n=2
    while name.lower() in used: name=f'{base}_{n}';n+=1
    used.add(name.lower());path='icons/'+name+'.webp'
    open(OUT+'/'+path,'wb').write(base64.b64decode(uri.split(',',1)[1]));icons[f]=path
d['icons']=icons
open(OUT+'/data.js','w',encoding='utf-8').write('window.DBD_DATA='+json.dumps(d,ensure_ascii=False,separators=(',',':'))+';\n')
open(OUT+'/app.js','w',encoding='utf-8').write(js);open(OUT+'/styles.css','w',encoding='utf-8').write(css)
print('icons',len(icons))
