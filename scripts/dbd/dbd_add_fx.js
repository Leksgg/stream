// Uso: node scripts/dbd/dbd_add_fx.js "D:/Builds DBD" public/dbd/data.json
// Ejecutar después de regenerar data.json: sin el campo fx, !perk deja de buscar por efecto.
// Añade a cada perk de public/dbd/data.json su lista de efectos (fx), detectados en el texto completo de la web Builds DBD.
const fs=require('fs');
const [src,dst]=process.argv.slice(2);
const code=fs.readFileSync(src+'/app.js','utf8').match(/const FX=[^\r\n]*/)[0];
const FX=eval(code.replace(/^const FX=/,'').replace(/;\s*$/,''));
global.window={};require(src+'/data.js');const W=window.DBD_DATA;
const unacc=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const full={};for(const p of W.perks)full[p.en]=unacc(p.d+' '+(p.cd||''));
const d=JSON.parse(fs.readFileSync(dst,'utf8'));let miss=[];
for(const p of d.perks){const t=full[p.en];if(t==null){miss.push(p.en);continue}const fx=FX.filter(f=>f[2].test(t)).map(f=>f[0]);if(fx.length)p.fx=fx;else delete p.fx}
fs.writeFileSync(dst,JSON.stringify(d));
console.log('sin texto:',miss, 'con fx:',d.perks.filter(p=>p.fx).length);
