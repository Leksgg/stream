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
