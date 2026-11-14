'use strict';
// Flarmalodebop v2 — static frontend on Supabase (auth + Postgres + Realtime + Storage).
const $ = s => document.querySelector(s);
const CFG = window.FLARM_CONFIG || {};
const EMAIL = { frog: 'frog@flarmalodebop.app', hailey: 'hailey@flarmalodebop.app' };
const ROOM = 'flarm:room';
const BUCKET = 'media';
const state = { me: null, other: null, msgs: new Map(), oldest: null, newest: 0, otherRead: 0, room: null, sound: localStorage.sound !== 'off', online: false };
const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.startsWith('__') && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.startsWith('__');
const sb = configured ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'flarm-auth' },
  realtime: { params: { eventsPerSecond: 10 } },
}) : null;

// ---------- helpers ----------
function toast(t, ms = 2400) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), ms); }
const ts = m => new Date(m.created_at).getTime();
const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function fmtDay(t) {
  const d = new Date(t), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const isEmojiOnly = s => s.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(s) && !/^\d+$/.test(s.trim());
function check(res) { if (res.error) { if (res.error.status === 401 || /JWT/i.test(res.error.message)) showLogin(); throw res.error; } return res.data; }

// ---------- sounds: pentatonic bops + a soft honk ----------
let actx;
function unlockAudio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (actx && actx.state === 'suspended') actx.resume(); }
document.addEventListener('touchend', unlockAudio, { once: true }); document.addEventListener('click', unlockAudio, { once: true });
function bop(kind) {
  if (!state.sound || !actx) return;
  const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  const notes = kind === 'in' ? [scale[Math.random() * 3 | 0], scale[3 + (Math.random() * 3 | 0)]] : [scale[4]];
  notes.forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.4);
  });
}
function honk(delay = 0) {
  if (!state.sound || !actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), o2 = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
  o.type = 'sawtooth'; o2.type = 'square';
  o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(280, t + 0.22);
  o2.frequency.setValueAtTime(333, t); o2.frequency.linearRampToValueAtTime(282, t + 0.22);
  f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 6;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.03); g.gain.linearRampToValueAtTime(0.05, t + 0.16); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  o.connect(f); o2.connect(f); f.connect(g).connect(actx.destination);
  o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
}

// ---------- goose energy 🪿 ----------
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GOOSE_SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <g class="g-body">
    <ellipse cx="60" cy="112" rx="30" ry="4" fill="rgba(0,0,0,.18)"/>
    <g class="g-leg l1"><rect x="50" y="88" width="4" height="18" rx="2" fill="#ff9a3c"/><path d="M45 106h14l-3 4h-11z" fill="#ff9a3c"/></g>
    <g class="g-leg l2"><rect x="64" y="88" width="4" height="18" rx="2" fill="#ff9a3c"/><path d="M59 106h14l-3 4h-11z" fill="#ff9a3c"/></g>
    <path d="M22 70c0-16 16-24 36-24 10 0 18 2 26 6l10 4c4 2 4 6 0 8-6 4-10 18-36 22-20 3-36-2-36-16z" fill="#fff6ea"/>
    <path d="M36 66c10 6 26 6 38 0" stroke="#e9d9c6" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M20 62l-8-6 10 1z" fill="#fff6ea"/>
    <path d="M78 54c2-14 0-26 4-34 3-7 14-8 18-2 3 4 1 9-4 10-4 1-5 6-5 12l-1 16z" fill="#fff6ea"/>
    <path d="M98 22l14 3c2 1 2 3 0 4l-13 2z" fill="#ff9a3c"/>
    <circle cx="92" cy="22" r="2.6" fill="#2b1a33"/><circle cx="92.8" cy="21.2" r=".9" fill="#fff"/>
    <ellipse cx="88" cy="29" rx="3.5" ry="2" fill="#ffb3c1" opacity=".8"/>
  </g></svg>`;
const FLY_SVG = `<svg viewBox="0 0 60 30" aria-hidden="true"><g class="wing-flap">
  <path d="M30 16c-6-8-16-12-28-10 9 2 17 6 22 13z" fill="currentColor"/>
  <path d="M30 16c6-8 16-12 28-10-9 2-17 6-22 13z" fill="currentColor"/></g>
  <ellipse cx="30" cy="18" rx="7" ry="3.2" fill="currentColor"/><path d="M36 17l8-2-7 4z" fill="#ff9a3c"/></svg>`;
function fxLayer() { let l = $('#fx'); if (!l) { l = document.createElement('div'); l.id = 'fx'; l.setAttribute('aria-hidden', 'true'); document.body.append(l); } return l; }
function waddleGoose() {
  if (reduceMotion) { honk(); return; }
  const g = document.createElement('div'); g.className = 'waddler' + (Math.random() < .5 ? ' rtl' : ''); g.innerHTML = GOOSE_SVG;
  const composerH = ($('.composer') || { offsetHeight: 80 }).offsetHeight;
  g.style.bottom = (composerH + 6) + 'px';
  fxLayer().append(g); honk(0.25);
  g.addEventListener('animationend', e => { if (e.target === g) g.remove(); });
}
function flockV() {
  if (reduceMotion) { honk(); return; }
  const v = document.createElement('div'); v.className = 'flock';
  const n = 9, mid = 4;
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div'); b.className = 'flyer'; b.innerHTML = FLY_SVG;
    const d = Math.abs(i - mid);
    b.style.left = (d * -34) + 'px'; b.style.top = ((i - mid) * 22) + 'px';
    b.style.animationDelay = (d * 0.07) + 's'; b.querySelector('.wing-flap').style.animationDelay = (d * 0.09) + 's';
    v.append(b);
  }
  v.style.top = (18 + Math.random() * 30) + '%';
  fxLayer().append(v); honk(0.1); honk(0.45); honk(0.8);
  v.addEventListener('animationend', e => { if (e.target === v) v.remove(); });
}
function gooseCheck(m) {
  if (m.kind !== 'text') return;
  const geese = (m.body.match(/🪿/gu) || []).length;
  const onlyGoose = m.body.replace(/[\s\ufe0f]/g, '').replace(/🪿/gu, '') === '';
  if (geese >= 5 || /the flock has assembled/i.test(m.body)) flockV();
  else if (geese >= 1 && onlyGoose) waddleGoose();
}

// ---------- boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
async function boot() {
  if (!configured) { $('#setup').classList.remove('hidden'); return; }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  try {
    const profiles = check(await sb.from('profiles').select('*'));
    state.me = profiles.find(p => p.id === session.user.id);
    state.other = profiles.find(p => p.id !== session.user.id);
    if (!state.me || !state.other) { await sb.auth.signOut(); return showLogin('This account isn’t part of Flarmalodebop.'); }
    state.otherRead = state.other.last_read;
    showChat();
  } catch (e) { console.error(e); showLogin(); }
}
function showLogin(msg) {
  $('#chat').classList.add('hidden'); $('#login').classList.remove('hidden');
  if (msg) $('#loginErr').textContent = msg;
  if (state.room) { sb.removeChannel(state.room); state.room = null; }
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); unlockAudio();
  const f = new FormData(e.target); $('#loginErr').textContent = '';
  const btn = $('.btn-primary'); btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL[f.get('username')], password: f.get('password') });
  btn.disabled = false;
  if (error) { $('#loginErr').textContent = /invalid/i.test(error.message) ? 'That name/password combo is off-key.' : error.message; return; }
  $('#pw').value = ''; boot();
});

async function showChat() {
  $('#login').classList.add('hidden'); $('#chat').classList.remove('hidden');
  $('#otherName').textContent = state.other.display;
  $('#otherAvatar').textContent = state.other.username === 'hailey' ? '🌸' : state.other.username === 'frog' ? '🐸' : state.other.display[0];
  $('#meLine').textContent = `Signed in as ${state.me.display}`;
  setPresence(false);
  state.msgs.clear(); $('#list').innerHTML = ''; state.newest = 0; state.oldest = null;
  const rows = await fetchPage();
  rows.forEach(m => addMsg(m, false));
  $('#loadOlder').classList.toggle('hidden', rows.length < 60);
  render(); scrollBottom(true); connect(); markRead(); heartbeat();
  updatePushUI();
}
async function fetchPage(before) {
  let q = sb.from('messages').select('*').order('id', { ascending: false }).limit(60);
  if (before) q = q.lt('id', before);
  return check(await q).reverse();
}

// ---------- realtime: postgres changes + presence + broadcast typing ----------
async function connect() {
  if (state.room) await sb.removeChannel(state.room);
  await sb.realtime.setAuth();
  const room = sb.channel(ROOM, { config: { private: true, presence: { key: state.me.id }, broadcast: { self: false } } });
  state.room = room;
  room
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => onIncoming(p.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => { if (p.old && state.msgs.delete(p.old.id)) render(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, p => { if (p.new.id === state.other.id) { state.otherRead = p.new.last_read; renderReceipt(); } })
    .on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload.user !== state.me.id) showTyping(payload.on); })
    .on('presence', { event: 'sync' }, () => setPresence(Object.keys(room.presenceState()).includes(state.other.id)))
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') { await room.track({ at: Date.now() }); catchUp(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setTimeout(() => { if (state.room === room && room.state !== 'joined') connect(); }, 3000);
      }
    });
}
function onIncoming(m) {
  const mine = m.sender === state.me.id;
  if (!addMsg(m, true)) return;
  render(); gooseCheck(m);
  if (!mine) { showTyping(false); bop('in'); }
  scrollBottom(mine || nearBottom()); markRead();
}
async function catchUp() {
  try {
    const rows = await fetchPage(); let added = false;
    rows.forEach(m => { if (addMsg(m, false)) added = true; });
    if (added) { render(); scrollBottom(nearBottom()); markRead(); }
    const p = check(await sb.from('profiles').select('id,last_read').eq('id', state.other.id).single());
    state.otherRead = p.last_read; renderReceipt();
  } catch {}
}
function chatVisible() { return document.visibilityState === 'visible' && state.me; }
function onForeground() {
  catchUp(); markRead(); heartbeat();
  if (state.room && state.room.state === 'joined') state.room.track({ at: Date.now() });
  else if (state.me) connect();
}
document.addEventListener('visibilitychange', () => { if (chatVisible()) onForeground(); });
window.addEventListener('focus', () => { if (chatVisible()) onForeground(); });
window.addEventListener('online', () => { if (state.me) { connect(); catchUp(); heartbeat(); } });
// Poll so messages and read receipts still land if the private realtime channel drops.
setInterval(() => {
  if (!chatVisible()) return;
  heartbeat();
  catchUp();
  if (state.room && state.room.state !== 'joined') connect();
}, 10000);
function heartbeat() { sb.rpc('heartbeat').then(() => {}, () => {}); }
function setPresence(on) { state.online = on; $('#status').classList.toggle('on', !!on); $('#statusText').textContent = on ? 'here now ♪' : 'away'; }
let typingTimer;
function showTyping(on) {
  clearTimeout(typingTimer); const nb = nearBottom();
  $('#typing').classList.toggle('hidden', !on);
  if (on) { typingTimer = setTimeout(() => showTyping(false), 6000); if (nb) scrollBottom(true); }
}
let readTimer;
function markRead() {
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    if (document.visibilityState !== 'visible' || !state.newest) return;
    sb.rpc('mark_read', { p_id: state.newest }).then(() => {}, () => {});
  }, 300);
}

// ---------- signed URLs for private media ----------
const urlCache = new Map(); // path -> {url, exp}
let pending = new Map(), flushTimer;
function signedUrl(path) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now() + 60e3) return Promise.resolve(c.url);
  return new Promise((res, rej) => {
    if (!pending.has(path)) pending.set(path, []);
    pending.get(path).push({ res, rej });
    clearTimeout(flushTimer); flushTimer = setTimeout(flushSigned, 20);
  });
}
async function flushSigned() {
  const batch = pending; pending = new Map();
  const paths = [...batch.keys()];
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  paths.forEach((p, i) => {
    const d = data && data.find(x => x.path === p) || (data && data[i]);
    if (error || !d || d.error || !d.signedUrl) batch.get(p).forEach(w => w.rej(error || new Error('no url')));
    else { urlCache.set(p, { url: d.signedUrl, exp: Date.now() + 3600e3 }); batch.get(p).forEach(w => w.res(d.signedUrl)); }
  });
}

// ---------- rendering ----------
const fresh = new Set();
function addMsg(m, isNew) {
  if (state.msgs.has(m.id)) return false;
  state.msgs.set(m.id, m); if (isNew) fresh.add(m.id);
  state.newest = Math.max(state.newest, m.id);
  state.oldest = state.oldest == null ? m.id : Math.min(state.oldest, m.id);
  return true;
}
const nearBottom = () => { const s = $('#scroller'); return s.scrollHeight - s.scrollTop - s.clientHeight < 160; };
function scrollBottom(force) { if (!force) return; const s = $('#scroller'); requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); }
const nodeCache = new Map(); // keep media elements alive across re-renders (no re-signing / reloading)

function render() {
  const list = $('#list'); list.innerHTML = '';
  const msgs = [...state.msgs.values()].sort((a, b) => a.id - b.id);
  $('#empty').classList.toggle('hidden', msgs.length > 0);
  let lastDay = '', prev = null;
  for (const m of msgs) {
    const t = ts(m), day = new Date(t).toDateString();
    if (day !== lastDay) { const d = document.createElement('div'); d.className = 'day'; d.textContent = fmtDay(t); list.append(d); lastDay = day; prev = null; }
    const mine = m.sender === state.me.id;
    const el = document.createElement('div');
    el.className = 'msg ' + (mine ? 'me' : 'them');
    if (!prev || prev.sender !== m.sender || t - ts(prev) > 5 * 60e3) el.classList.add('gap');
    if (fresh.has(m.id)) el.classList.add('new');
    el.dataset.id = m.id;
    let b = nodeCache.get(m.id);
    if (!b) {
      b = document.createElement('div'); b.className = 'bubble';
      if (m.kind === 'text') { b.textContent = m.body; if (isEmojiOnly(m.body)) b.classList.add('emoji'); }
      else if (m.kind === 'photo') b.append(...photoEls(m, b));
      else if (m.kind === 'voice') b.append(voiceEl(m));
      if (m.kind !== 'text') nodeCache.set(m.id, b);
    }
    el.append(b);
    const meta = document.createElement('div'); meta.className = 'meta';
    const tm = document.createElement('span'); tm.className = 'time'; tm.textContent = fmtTime(t); meta.append(tm);
    el.append(meta);
    list.append(el); prev = m;
  }
  fresh.clear(); renderReceipt();
}
function photoEls(m, b) {
  b.classList.add('photo');
  const img = new Image(); img.alt = 'photo'; img.className = 'loading';
  if (m.meta && m.meta.w) { img.style.aspectRatio = `${m.meta.w}/${m.meta.h}`; img.style.width = Math.min(m.meta.w, 320) + 'px'; img.style.height = 'auto'; }
  signedUrl(m.file_path).then(u => { img.src = u; }).catch(() => { img.alt = 'photo unavailable'; });
  img.onload = () => { img.classList.remove('loading'); if (nearBottom()) scrollBottom(true); };
  img.onclick = () => { $('#viewer img').src = img.src; $('#viewer').classList.remove('hidden'); };
  const out = [img];
  if (m.body) { const c = document.createElement('div'); c.className = 'cap'; c.textContent = m.body; out.push(c); }
  return out;
}
function renderReceipt() {
  document.querySelectorAll('.rcpt').forEach(e => e.remove());
  const mine = [...document.querySelectorAll('.msg.me')]; const last = mine[mine.length - 1];
  if (!last) return;
  const id = +last.dataset.id;
  if ([...state.msgs.values()].some(m => m.id > id && m.sender !== state.me.id)) return;
  const s = document.createElement('span'); s.className = 'rcpt';
  s.textContent = state.otherRead >= id ? '♫ Read' : '♪ Delivered';
  last.querySelector('.meta').append(s);
}

let playing = null;
function voiceEl(m) {
  const wrap = document.createElement('div'); wrap.className = 'voice';
  const btn = document.createElement('button'); btn.className = 'play'; btn.textContent = '▶'; btn.setAttribute('aria-label', 'Play voice note');
  const bars = document.createElement('div'); bars.className = 'bars';
  const peaks = (m.meta && m.meta.peaks) || Array.from({ length: 32 }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7 + m.id)));
  peaks.forEach(p => { const i = document.createElement('i'); i.style.height = Math.max(10, p * 100) + '%'; bars.append(i); });
  const dur = document.createElement('span'); dur.className = 'dur';
  const total = (m.meta && m.meta.dur) || 0; dur.textContent = fmtDur(total);
  let audio;
  btn.onclick = async () => {
    unlockAudio();
    if (!audio) {
      btn.textContent = '…';
      try { audio = new Audio(await signedUrl(m.file_path)); } catch { btn.textContent = '▶'; return toast('Couldn’t load that voice note'); }
      audio.preload = 'auto';
      audio.ontimeupdate = () => {
        const d = isFinite(audio.duration) && audio.duration ? audio.duration : total || 1;
        const n = Math.round(audio.currentTime / d * peaks.length);
        [...bars.children].forEach((b, i) => b.classList.toggle('on', i < n));
        dur.textContent = fmtDur(audio.currentTime);
      };
      audio.onended = audio.onpause = () => { btn.textContent = '▶'; if (audio.ended) { [...bars.children].forEach(b => b.classList.remove('on')); dur.textContent = fmtDur(total); } };
      audio.onplay = () => { btn.textContent = '❚❚'; };
    }
    if (audio.paused) { if (playing && playing !== audio) playing.pause(); playing = audio; audio.play().catch(() => { btn.textContent = '▶'; toast('Could not play that one'); }); }
    else audio.pause();
  };
  wrap.append(btn, bars, dur);
  return wrap;
}
$('#loadOlder').onclick = async () => {
  const s = $('#scroller'); const h = s.scrollHeight;
  const rows = await fetchPage(state.oldest);
  rows.forEach(m => addMsg(m, false)); render();
  s.scrollTop = s.scrollHeight - h;
  $('#loadOlder').classList.toggle('hidden', rows.length < 60);
};
$('#viewer').onclick = () => $('#viewer').classList.add('hidden');

// ---------- composer ----------
const ta = $('#text');
let typingSent = false, typingIdle;
function sendTyping(on) { if (state.room) state.room.send({ type: 'broadcast', event: 'typing', payload: { user: state.me.id, on } }); typingSent = on; }
ta.addEventListener('input', () => {
  ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  const has = ta.value.trim().length > 0;
  $('#sendBtn').classList.toggle('hidden', !has); $('#micBtn').classList.toggle('hidden', has);
  if (has && !typingSent) sendTyping(true);
  clearTimeout(typingIdle); typingIdle = setTimeout(() => typingSent && sendTyping(false), 3000);
  if (!has && typingSent) sendTyping(false);
});
ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); } });
$('#sendBtn').addEventListener('click', sendText);
async function insertMessage(row) {
  const m = check(await sb.from('messages').insert(row).select().single());
  if (addMsg(m, true)) { render(); scrollBottom(true); gooseCheck(m); }
  bop('out');
}
async function sendText() {
  const body = ta.value; if (!body.trim()) return;
  ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); sendTyping(false);
  try { await insertMessage({ kind: 'text', body }); }
  catch { toast('Didn’t send — check your connection'); ta.value = body; ta.dispatchEvent(new Event('input')); }
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };
async function upload(blob, mime, kind, meta, caption) {
  const ext = EXT[mime]; if (!ext) throw new Error('unsupported file type');
  const path = `${state.me.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  await insertMessage({ kind, body: caption || '', file_path: path, mime, meta });
}
$('#photoInput').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  toast('Sending photo…', 1500);
  try {
    let blob = file, mime = file.type || 'image/jpeg', w = 0, h = 0;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (bmp) {
      const sc = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      w = Math.round(bmp.width * sc); h = Math.round(bmp.height * sc);
      if (mime !== 'image/gif') {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); mime = 'image/jpeg';
      }
    }
    await upload(blob, mime, 'photo', { w, h });
  } catch (err) { toast('Photo didn’t send: ' + err.message); }
});

let rec = null;
$('#micBtn').addEventListener('click', startRec);
async function startRec() {
  unlockAudio();
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Voice notes need iOS 14.5+ / a modern browser');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { return toast('Microphone permission is off — allow it in Settings'); }
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  const mimeType = types.find(t => MediaRecorder.isTypeSupported(t));
  const mr = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
  const chunks = [], peaks = [], start = Date.now();
  mr.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
  let an, raf, src;
  if (actx) { src = actx.createMediaStreamSource(stream); an = actx.createAnalyser(); an.fftSize = 512; src.connect(an); }
  const cv = $('#recCanvas'), g = cv.getContext('2d'); const buf = an ? new Uint8Array(an.fftSize) : null; const levels = [];
  function draw() {
    const t = (Date.now() - start) / 1000; $('#recTime').textContent = fmtDur(t);
    if (t > 300) return stop(true);
    let lvl = 0.2 + 0.2 * Math.random();
    if (an) { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2; lvl = Math.min(1, Math.sqrt(s / buf.length) * 4); }
    levels.push(lvl); if (levels.length % 4 === 0) peaks.push(lvl);
    g.clearRect(0, 0, cv.width, cv.height); const n = 60, bw = cv.width / n;
    levels.slice(-n).forEach((v, i) => { const hh = Math.max(3, v * cv.height); g.fillStyle = i % 2 ? '#ffc861' : '#ff5e8a'; g.fillRect(i * bw + 1, (cv.height - hh) / 2, bw - 2, hh); });
    raf = requestAnimationFrame(draw);
  }
  function cleanup() { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); if (src) src.disconnect(); $('#recBar').classList.add('hidden'); $('#inputBar').classList.remove('hidden'); rec = null; }
  function stop(send) {
    if (!rec) return; rec = null;
    mr.onstop = async () => {
      cleanup();
      const dur = (Date.now() - start) / 1000;
      if (!send || dur < 0.6) return;
      const type = (mr.mimeType || mimeType || 'audio/mp4').split(';')[0];
      const N = 32, out = [];
      for (let i = 0; i < N; i++) { const a = peaks.slice(Math.floor(i * peaks.length / N), Math.ceil((i + 1) * peaks.length / N) || 1); out.push(+(a.length ? Math.max(...a) : 0.2).toFixed(2)); }
      try { await upload(new Blob(chunks, { type }), type, 'voice', { dur: Math.round(dur * 10) / 10, peaks: out }); }
      catch (e) { toast('Voice note didn’t send: ' + e.message); }
    };
    mr.stop();
  }
  rec = { stop };
  mr.start(250);
  $('#inputBar').classList.add('hidden'); $('#recBar').classList.remove('hidden');
  draw();
}
$('#recSend').addEventListener('click', () => rec && rec.stop(true));
$('#recCancel').addEventListener('click', () => rec && rec.stop(false));

// ---------- settings / push ----------
$('#menuBtn').onclick = () => { $('#sheet').classList.remove('hidden'); updatePushUI(); };
$('#closeSheet').onclick = () => $('#sheet').classList.add('hidden');
$('#sheet').onclick = e => { if (e.target.id === 'sheet') $('#sheet').classList.add('hidden'); };
const soundLabel = () => `🎵 Bop & honk sounds: ${state.sound ? 'on' : 'off'}`;
$('#soundBtn').textContent = soundLabel();
$('#soundBtn').onclick = () => { state.sound = !state.sound; localStorage.sound = state.sound ? 'on' : 'off'; $('#soundBtn').textContent = soundLabel(); unlockAudio(); bop('in'); };
$('#logoutBtn').onclick = async () => { await sb.auth.signOut(); $('#sheet').classList.add('hidden'); showLogin(); };

const vapid = CFG.VAPID_PUBLIC && !CFG.VAPID_PUBLIC.startsWith('__') ? CFG.VAPID_PUBLIC : null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function updatePushUI() {
  const note = $('#pushNote'), btn = $('#pushBtn');
  if (!vapid) { btn.disabled = true; note.textContent = 'Notifications aren’t set up yet.'; return; }
  if (!('PushManager' in window) || !('Notification' in window)) {
    note.textContent = /iPhone|iPad/.test(navigator.userAgent) && !standalone
      ? 'On iPhone: tap Share → Add to Home Screen, open Flarmalodebop from there, then turn notifications on.'
      : 'This browser doesn’t support notifications.';
    btn.disabled = true; return;
  }
  btn.disabled = false;
  if (Notification.permission === 'granted') { btn.textContent = '🔔 Notifications on (tap to refresh)'; note.textContent = 'You’ll get a ping when a new message lands while the app is closed.'; }
  else if (Notification.permission === 'denied') { btn.textContent = '🔕 Notifications blocked'; note.textContent = 'Turn them back on in iPhone Settings → Notifications → Flarmalodebop.'; }
  else { btn.textContent = '🔔 Turn on notifications'; note.textContent = ''; }
}
$('#pushBtn').onclick = async () => {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return updatePushUI();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(vapid) });
    const j = sub.toJSON();
    check(await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: state.me.id, sub: j }));
    toast('Notifications on ♪'); updatePushUI();
  } catch (e) { toast('Couldn’t turn on notifications: ' + e.message); }
};
function b64ToU8(s) { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); }

if (sb) sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showLogin(); if (ev === 'TOKEN_REFRESHED' && state.room) sb.realtime.setAuth(); });
window.__flarm = { waddleGoose, flockV }; // handy for testing the goose effects
boot();
