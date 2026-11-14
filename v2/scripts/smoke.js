// Smoke test against the real Supabase project using ONLY the public key (+ the two member passwords if present).
// Usage (from repo root): node v2/scripts/smoke.js         — never prints secrets.
// Phase A (always): anon cannot read anything; anonymous sign-up is refused once signups are disabled.
// Phase B (if setup + users SQL have run): both members sign in, send/receive via Realtime, typing broadcast,
//          read receipt, private storage upload + signed URL; then cleans up its test message/file.
const fs = require('fs');
const vm = require('vm');
const { createClient } = require('@supabase/supabase-js');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(__dirname + '/../public/config.js', 'utf8'), ctx);
const { SUPABASE_URL: URL, SUPABASE_ANON_KEY: KEY } = ctx.window.FLARM_CONFIG;
const env = {};
try { for (const l of fs.readFileSync('/home/box/.secrets/flarmalodebop-v2.env', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; } } catch {}
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (c, t) => console.log((c ? 'PASS ' : 'FAIL ') + t);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  console.log('Project:', URL);
  const anon = mk();
  for (const t of ['messages', 'profiles', 'push_subscriptions', 'activity', 'allowed_members']) {
    const { data, error } = await anon.from(t).select('*').limit(1);
    ok(error || (data && data.length === 0), `anon cannot read ${t} (${error ? error.code || error.message : '0 rows'})`);
  }
  const { data: bl } = await anon.storage.from('media').list('', { limit: 1 });
  ok(!bl || bl.length === 0, 'anon cannot list media bucket');
  // Only probe sign-up once setup.sql has installed the invite-only guard (otherwise a probe would create a real user).
  const probe = await anon.from('messages').select('id').limit(1);
  if (probe.error && probe.error.code === 'PGRST205') console.log('SKIP sign-up probe: setup.sql not run yet');
  else {
    const su = await anon.auth.signUp({ email: `smoke-${Date.now()}@example.com`, password: 'x-' + Math.random().toString(36) });
    ok(!!su.error, `public sign-up refused (${su.error ? su.error.message : 'ACCOUNT WAS CREATED — disable signups!'})`);
  }
  if (!env.FROG_PASSWORD) return console.log('No member passwords on box — skipping phase B.');
  const frog = mk(), hailey = mk();
  const a = await frog.auth.signInWithPassword({ email: env.FROG_EMAIL, password: env.FROG_PASSWORD });
  const b = await hailey.auth.signInWithPassword({ email: env.HAILEY_EMAIL, password: env.HAILEY_PASSWORD });
  ok(!a.error, 'frog signs in' + (a.error ? ` (${a.error.message})` : ''));
  ok(!b.error, 'hailey signs in' + (b.error ? ` (${b.error.message})` : ''));
  if (a.error || b.error) return;
  const F = a.data.user.id;
  const { data: profs } = await frog.from('profiles').select('username');
  ok(profs && profs.length === 2, `profiles visible to member: ${profs && profs.map(p => p.username).join(',')}`);
  // realtime
  await hailey.realtime.setAuth(); await frog.realtime.setAuth();
  let gotMsg = null, gotTyping = false, presence = [];
  const hch = hailey.channel('flarm:room', { config: { private: true, presence: { key: b.data.user.id } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => { gotMsg = p.new; })
    .on('broadcast', { event: 'typing' }, () => { gotTyping = true; })
    .on('presence', { event: 'sync' }, () => { presence = Object.keys(hch.presenceState()); });
  const fch = frog.channel('flarm:room', { config: { private: true, presence: { key: F } } });
  const sub = ch => new Promise(r => ch.subscribe(s => { if (s !== 'CLOSED') r(s); }));
  const s1 = await sub(hch), s2 = await sub(fch);
  ok(s1 === 'SUBSCRIBED' && s2 === 'SUBSCRIBED', `private realtime channel joined (${s1}/${s2})`);
  await fch.track({ at: Date.now() }); await sleep(1500);
  ok(presence.includes(F), 'hailey sees frog online (presence)');
  await fch.send({ type: 'broadcast', event: 'typing', payload: { user: F, on: true } });
  const ins = await frog.from('messages').insert({ kind: 'text', body: '[smoke test — auto-deleted]' }).select().single();
  ok(!ins.error, 'frog inserts message' + (ins.error ? ` (${ins.error.message})` : ''));
  await sleep(2500);
  ok(gotTyping, 'hailey receives typing broadcast');
  ok(gotMsg && ins.data && gotMsg.id === ins.data.id, 'hailey receives message via realtime');
  const spoof = await hailey.from('messages').insert({ kind: 'text', body: 'x', sender: F });
  ok(!!spoof.error, 'hailey cannot send as frog');
  await hailey.rpc('mark_read', { p_id: ins.data.id });
  const { data: hp } = await frog.from('profiles').select('last_read').eq('username', 'hailey').single();
  ok(hp && hp.last_read >= ins.data.id, 'read receipt recorded');
  const path = `${F}/smoke-${Date.now()}.jpg`;
  const up = await frog.storage.from('media').upload(path, new Blob([Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64')], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  ok(!up.error, 'frog uploads to private bucket' + (up.error ? ` (${up.error.message})` : ''));
  const bad = await hailey.storage.from('media').upload(`${F}/evil.jpg`, new Blob(['x'], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
  ok(!!bad.error, 'hailey cannot upload into frog’s folder');
  const sg = await hailey.storage.from('media').createSignedUrl(path, 60);
  const fetched = sg.data ? (await fetch(sg.data.signedUrl)).status : 0;
  ok(fetched === 200, `hailey opens photo via signed URL (${fetched})`);
  const pub = await fetch(`${URL}/storage/v1/object/public/media/${path}`);
  ok(pub.status >= 400, `no public URL access (${pub.status})`);
  // cleanup
  await frog.from('messages').delete().eq('id', ins.data.id);
  await frog.storage.from('media').remove([path]);
  await frog.rpc('mark_read', { p_id: 0 });
  await frog.removeAllChannels(); await hailey.removeAllChannels();
  console.log('cleanup done');
  process.exit(0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
