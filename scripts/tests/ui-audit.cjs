const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const screens = require('../../src/screens.json');
const base = process.env.BASE_URL || 'http://127.0.0.1:5178';
const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(file => fs.existsSync(file));
if (!chrome) throw new Error('Set CHROME_PATH to your Chrome or Chromium executable.');
(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const report = { screens: screens.length, renderChecks: 0, pointerChecks: 0, failures: [], errors: [] };
  try {
    const page = await browser.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    for (let index = 0; index < screens.length; index++) {
      const screen = screens[index];
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 }); await page.goto(base + screen.route); await page.waitForSelector('.screen-root'); await page.evaluate(() => document.fonts.ready);
        const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, layers: document.querySelectorAll('.design-layer').length }));
        report.renderChecks++; if (size.width > width + 2 || size.layers < 2) report.failures.push({ route: screen.route, requestedWidth: width, ...size });
        if (width !== 1440) continue;
        const targets = await page.evaluate(() => {
          let checked = 0; const failures = [];
          for (const element of document.querySelectorAll('.screen-root button, .screen-root a, .screen-root input, .screen-root textarea')) {
            if (element.type === 'file' || element.disabled || !element.getClientRects().length) continue;
            let rect = element.getBoundingClientRect(), painted = true;
            if (rect.width < 2 || rect.height < 2) continue;
            for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX) || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) {
                const r = ancestor.getBoundingClientRect();
                if (rect.right <= r.left || rect.left >= r.right || rect.bottom <= r.top || rect.top >= r.bottom) { painted = false; break; }
              }
            }
            if (!painted) continue;
            element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); rect = element.getBoundingClientRect();
            const top = document.elementFromPoint(Math.max(2, Math.min(innerWidth - 2, rect.x + rect.width / 2)), Math.max(2, Math.min(innerHeight - 2, rect.y + rect.height / 2)));
            checked++;
            if (top !== element && !element.contains(top)) failures.push({ label: element.getAttribute('aria-label') || element.innerText?.slice(0, 60), node: element.closest('[data-node]')?.dataset.node, interceptedBy: top?.tagName });
          }
          return { checked, failures };
        });
        report.pointerChecks += targets.checked; if (targets.failures.length) report.failures.push({ route: screen.route, pointerTargets: targets.failures });
      }
      if (index % 15 === 0) console.log(`Checked ${index + 1}/${screens.length} screens`);
    }
    fs.writeFileSync(path.resolve(__dirname, '../../design/verification-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2)); if (report.failures.length || report.errors.length) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
