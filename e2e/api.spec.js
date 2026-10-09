// @ts-check
const { test, expect } = require('@playwright/test');

test('GET /api/health responde ok', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, service: 'stream-assets' });
});

test('GET /api/assets devuelve el manifiesto', async ({ request }) => {
  const response = await request.get('/api/assets');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.version).toBe(1);
  expect(manifest.assets.length).toBeGreaterThan(0);
  expect(manifest.overlay.main).toBe('/overlay/index.html');
});

test('GET /txt/hola.txt respeta ?line y ?full', async ({ request }) => {
  const line = await request.get('/txt/hola.txt?line=1');
  expect(line.ok()).toBeTruthy();
  expect(await line.text()).toBe('Buenas noches.');

  const full = await request.get('/txt/hola.txt?full=true');
  expect(full.ok()).toBeTruthy();
  const text = await full.text();
  expect(text.split('\n').length).toBeGreaterThan(1);
  expect(text).toContain('Buenas noches.');
});

test('GET /dbd/perk y /dbd/pj responden texto para el chat', async ({ request }) => {
  const perk = await request.get('/dbd/perk?q=adren');
  expect(perk.ok()).toBeTruthy();
  expect(await perk.text()).toMatch(/^Adrenalina \(Meg Thomas\): /);

  const changed = await request.get('/dbd/perk?q=kindred');
  expect(await changed.text()).toContain('[cambió en 10.2.0]');

  const pj = await request.get('/dbd/pj?q=jake');
  expect(await pj.text()).toBe('Jake Park (superviviente): Espíritu calmado · Voluntad de hierro · Sabotear');

  const ambiguous = await request.get('/dbd/pj?q=grimes');
  expect(await ambiguous.text()).toContain('Rick Grimes');
});

test('GET /dbd/pj.svg devuelve una tarjeta con los iconos embebidos', async ({ request }) => {
  const response = await request.get('/dbd/pj.svg?q=ash');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  const svg = await response.text();
  expect(svg).toContain('Ashley J. Williams');
  expect((svg.match(/data:image\/webp;base64,/g) || []).length).toBe(4);
});

test('GET /dbd/random/* repite el resultado con la misma semilla', async ({ request }) => {
  const a = await (await request.get('/dbd/random/build?s=42&u=Prueba')).text();
  const b = await (await request.get('/dbd/random/build?s=42&u=Prueba')).text();
  expect(a).toBe(b);
  expect(a).toMatch(/^Build para Prueba: .+ \| Objeto: /);

  const killer = await (await request.get('/dbd/random/build?r=killer&s=42')).text();
  expect(killer).toMatch(/^Build aleatoria con .+ \| Accesorios: /);

  const survi = await (await request.get('/dbd/random/survi?s=7')).text();
  const card = await (await request.get('/dbd/random/survi.svg?s=7')).text();
  const name = survi.match(/^Te toca: (.+?) \(/)[1];
  expect(card).toContain(name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

  const killerPick = await (await request.get('/dbd/random/killer?s=7')).text();
  expect(killerPick).toMatch(/^Te toca: /);
});
