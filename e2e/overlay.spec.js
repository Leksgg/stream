// @ts-check
const { test, expect } = require('@playwright/test');

// ws=ws://127.0.0.1:9 apunta a un puerto muerto para que el overlay no
// intente conectar con el WebSocket real de Leksimus durante los tests.
const OVERLAY_URL = '/overlay/index.html?room=e2e&ws=ws://127.0.0.1:9/';

test('el overlay carga con su estructura esperada', async ({ page }) => {
  await page.goto(OVERLAY_URL);

  await expect(page).toHaveTitle('Stream Overlay');
  await expect(page.locator('#grid .slot')).toHaveCount(9);
  await expect(page.locator('#fullscreen-host')).toBeAttached();
});

test('el indicador de estado solo aparece con ?debug', async ({ page }) => {
  await page.goto(OVERLAY_URL);
  await expect(page.locator('#status')).toBeHidden();

  await page.goto(OVERLAY_URL + '&debug');
  await expect(page.locator('#status')).toBeVisible();
});

test('un evento alert renderiza una alert-box en el slot indicado', async ({ page }) => {
  await page.goto(OVERLAY_URL);

  await page.evaluate(() => {
    // handleEvent es global: lo expone el <script> inline del overlay.
    window.handleEvent({ type: 'alert', text: 'Alerta E2E', sub: 'subtitulo', position: 5, duration: 30 });
  });

  const box = page.locator('.slot[data-pos="5"] .alert-box');
  await expect(box).toBeVisible();
  await expect(box).toContainText('Alerta E2E');
  await expect(box.locator('.sub')).toHaveText('subtitulo');
});
