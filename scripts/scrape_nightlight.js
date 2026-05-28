const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://nightlight.gg/perks/viewer?shown=pick', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('table tr'))
      .map((tr) => tr.innerText.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
  );

  console.log(JSON.stringify(rows, null, 2));

  await browser.close();
})();
