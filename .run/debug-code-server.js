const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR', err.stack || err.message));
  page.on('requestfailed', req => console.log('REQFAILED', req.url(), req.failure()?.errorText));
  const resp = await page.goto('http://127.0.0.1:8080/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('STATUS', resp && resp.status(), page.url());
  await page.waitForTimeout(8000);
  console.log('TITLE', await page.title());
  console.log('BODY', (await page.locator('body').innerText({ timeout: 1000 }).catch(e => '')).slice(0, 500));
  await page.screenshot({ path: '.run/black-debug.png', fullPage: false });
  await browser.close();
})();
