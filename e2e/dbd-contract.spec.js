// Contrato de los datos de DBD que lee la web de Digital Bite (/dbd/builder.json) y el bot (/dbd/data.json).
// Si falla, no se despliega: la web usaría datos incompletos o iconos rotos.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public', 'dbd');
const iconExists = rel => fs.existsSync(path.join(PUBLIC, rel));

test('builder.json cumple el esquema v1 y se sirve con CORS', async ({ request }) => {
  const res = await request.get('/dbd/builder.json');
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['access-control-allow-origin']).toBe('*');
  const d = await res.json();
  expect(d.schemaVersion).toBe(1);
  expect(d.patch).toMatch(/^\d+\.\d+\.\d+$/);
  for (const g of ['perks', 'killers', 'items', 'adds', 'addk']) expect(d[g].length).toBeGreaterThan(0);

  for (const p of d.perks) {
    expect(typeof p.id).toBe('string');
    expect(['s', 'k']).toContain(p.r);
    expect(p.n && p.en && p.d).toBeTruthy();
    expect(Array.isArray(p.fx)).toBeTruthy();
  }
  const killerPowers = new Set(d.killers.map(k => k.p));
  for (const a of d.addk) expect(killerPowers.has(a.p)).toBeTruthy();
  const itemTypes = new Set(d.items.map(i => i.t));
  for (const a of d.adds) expect(itemTypes.has(a.t)).toBeTruthy();
});

test('los ids del builder son únicos por grupo y cada entrada tiene su icono', async ({ request }) => {
  const d = await (await request.get('/dbd/builder.json')).json();
  const missing = [];
  for (const g of ['perks', 'killers', 'items', 'adds', 'addk']) {
    const ids = d[g].map(x => x.id);
    expect(new Set(ids).size, `ids repetidos en ${g}`).toBe(ids.length);
    for (const x of d[g]) if (!x.i || !iconExists(x.i)) missing.push(`${g}:${x.id}`);
  }
  expect(missing).toEqual([]);
});

test('data.json del bot tiene icono en cada perk, personaje, objeto y accesorio', async ({ request }) => {
  const d = await (await request.get('/dbd/data.json')).json();
  const missing = ['perks', 'chars', 'items', 'adds'].flatMap(g => d[g].filter(x => !x.i || !iconExists(x.i)).map(x => `${g}:${x.k}`));
  expect(missing).toEqual([]);
});

test('los iconos de DBD se sirven con CORS y caché larga', async ({ request }) => {
  const d = await (await request.get('/dbd/builder.json')).json();
  for (const rel of [d.perks[0].i, d.killers[0].i, d.items[0].i, d.addk[0].i]) {
    const res = await request.get('/dbd/' + rel);
    expect(res.ok(), rel).toBeTruthy();
    expect(res.headers()['access-control-allow-origin']).toBe('*');
    expect(res.headers()['cache-control']).toContain('max-age=604800');
  }
});
