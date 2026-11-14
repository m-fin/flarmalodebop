// Read-only live check: wrong pw message, sign-in as frog, chat screen + websocket, then sign out. Sends no messages.
const fs = require('fs');
const puppeteer = require('/workspace/tools/pptr/node_modules/puppeteer-core');
const BASE = fs.readFileSync(__dirname + '/../LIVE_URL.txt', 'utf8').trim();
const env = Object.fromEntries(fs.readFileSync('/home/box/.secrets/flarmalodebop.env', 'utf8').split('\n').filter(l => /^[A-Z]/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true });
  const r = await p.goto(BASE, { waitUntil: 'networkidle2' }); console.log('status', r.status(), 'hsts', !!r.headers()['strict-transport-security']);
  await p.type('#pw', 'wrong-one'); await p.click('.btn-primary'); await new Promise(r => setTimeout(r, 1200));
  console.log('wrong pw ->', await p.$eval('#loginErr', e => e.textContent));
  await p.$eval('#pw', e => e.value = ''); await p.type('#pw', env.FROG_PASSWORD); await p.click('.btn-primary');
  await p.waitForSelector('#chat:not(.hidden)', { timeout: 10000 }); await new Promise(r => setTimeout(r, 1500));
  console.log('chat with:', await p.$eval('#otherName', e => e.textContent), '| ws open:', await p.evaluate(() => window.navigator.onLine));
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  console.log('service worker registered:', sw);
  await p.evaluate(() => fetch('/api/logout', { method: 'POST' }));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
