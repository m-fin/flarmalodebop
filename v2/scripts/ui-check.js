// Local static UI check: page boots with config + vendored supabase-js, wrong password message, goose effects render.
const puppeteer = require('/workspace/tools/pptr/node_modules/puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8790';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE, { waitUntil: 'networkidle2' });
  console.log('login visible:', await p.$eval('#login', e => !e.classList.contains('hidden')), '| supabase-js loaded:', await p.evaluate(() => !!window.supabase));
  await p.type('#pw', 'definitely-wrong'); await p.click('.btn-primary'); await sleep(2500);
  console.log('wrong pw ->', await p.$eval('#loginErr', e => e.textContent));
  await p.evaluate(() => window.__flarm.waddleGoose()); await sleep(2300);
  await p.screenshot({ path: '../screens/v2-goose-waddle.png' });
  await p.evaluate(() => window.__flarm.flockV()); await sleep(2600);
  await p.screenshot({ path: '../screens/v2-flock-v.png' });
  console.log('errors:', errs.filter(e => !/400|Invalid login/.test(e)));
  await b.close();
})();
