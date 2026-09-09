'use strict';
// Canvas WebP encoding runs on wall time, not Chrome's accelerated virtual clock.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { isolatePlaywrightPage } = require('./helpers/visitor-traffic');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    for (const [width, height] of [[1440, 1200], [768, 1024], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      await isolatePlaywrightPage(page);
      await page.goto(pathToFileURL(path.join(__dirname, 'banner-admin-chrome-e2e.html')).href + '#images');
      await page.waitForFunction(() => ['PASS', 'FAIL'].includes(document.documentElement.dataset.e2eResult), null, { timeout: 60000 });
      const result = await page.locator('#e2eResult').textContent();
      if (await page.getAttribute('html', 'data-e2e-result') !== 'PASS') throw new Error(`${width}x${height}: ${result}`);
      console.log(`${width}x${height}: ${result}`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
