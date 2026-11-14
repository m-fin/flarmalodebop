// End-to-end test against a demo server (isolated data). Never prints secrets.
const fs = require('fs');
const puppeteer = require('/workspace/tools/pptr/node_modules/puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8788';
const env = Object.fromEntries(fs.readFileSync(process.env.SECRETS || '/tmp/flarm-demo/secrets.env', 'utf8').split('\n').filter(l => /^[A-Z]/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1)]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async () => { const ctx = await browser.createBrowserContext(); const p = await ctx.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: false });
    p.on('pageerror', e => console.log('PAGEERROR', e.message)); await ctx.overridePermissions(BASE, ['microphone', 'notifications']); return p; };
  const frog = await mk(), hailey = await mk();
  await frog.goto(BASE); await frog.waitForSelector('#login:not(.hidden)');
  await sleep(600); await frog.screenshot({ path: 'screens/01-login.png' });
  // wrong password
  await frog.type('#pw', 'nope'); await frog.click('.btn-primary'); await sleep(400);
  console.log('wrong pw ->', await frog.$eval('#loginErr', e => e.textContent));
  const login = async (p, who, pw) => { await p.goto(BASE); await p.waitForSelector('#login:not(.hidden)');
    await p.click(`input[value=${who}]`); await p.$eval('#pw', e => e.value = ''); await p.type('#pw', pw); await p.click('.btn-primary'); await p.waitForSelector('#chat:not(.hidden)'); };
  await login(frog, 'frog', env.FROG_PASSWORD); await login(hailey, 'hailey', env.HAILEY_PASSWORD);
  await sleep(500);
  console.log('frog sees status:', await frog.$eval('#statusText', e => e.textContent));
  const say = async (p, t) => { await p.click('#text'); await p.type('#text', t); await p.click('#sendBtn'); await sleep(350); };
  await say(hailey, 'hiii 🌸 did the goose book get any fancier');
  await say(frog, 'SO much fancier. wait till you see the cover');
  // typing indicator check
  await frog.type('#text', 'sending'); await sleep(400);
  console.log('hailey sees typing:', await hailey.$eval('#typing', e => !e.classList.contains('hidden')));
  await frog.$eval('#text', e => { e.value = ''; e.dispatchEvent(new Event('input')); });
  const inp = await frog.$('#photoInput'); await inp.uploadFile('/tmp/flarm-demo/sample.jpg'); await sleep(1500);
  await say(hailey, 'omg the colors 😍');
  await say(hailey, '🪿');
  // voice note from hailey (fake mic)
  await hailey.click('#micBtn'); await sleep(2600); await hailey.click('#recSend'); await sleep(1500);
  await say(frog, 'that’s the one. Flarmalodebop forever ♫');
  await sleep(800);
  const count = async p => p.$$eval('#list .msg', e => e.length);
  console.log('messages frog/hailey:', await count(frog), await count(hailey));
  console.log('frog receipt:', await frog.$eval('.rcpt', e => e.textContent).catch(() => 'none'));
  console.log('photo loaded:', await hailey.$eval('.bubble.photo img', i => i.naturalWidth));
  console.log('voice in frog view:', await frog.$$eval('.voice', e => e.length));
  const vstat = await frog.evaluate(async () => { const f = document.querySelector('.voice').closest('.msg'); const id = f.dataset.id; const r = await fetch('/api/messages'); const rows = await r.json(); const m = rows.find(x => x.id == id); const a = await fetch('/media/' + m.file); return [m.mime, m.meta && m.meta.dur, a.status, (await a.blob()).size]; });
  console.log('voice note:', vstat);
  // unauth media access must fail
  const anon = await (await browser.createBrowserContext()).newPage();
  const st = await anon.goto(BASE + '/api/messages'); console.log('anon /api/messages status:', st.status());
  await frog.evaluate(() => document.querySelector('#scroller').scrollTop = 1e6); await sleep(500);
  await frog.screenshot({ path: 'screens/02-chat.png' });
  await hailey.click('#menuBtn'); await sleep(500); await hailey.screenshot({ path: 'screens/03-settings.png' });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
