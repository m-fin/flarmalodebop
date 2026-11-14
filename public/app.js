'use strict';
const $ = s => document.querySelector(s);
const state = { me: null, other: null, msgs: new Map(), oldest: null, newest: 0, otherRead: 0, ws: null, sound: localStorage.sound !== 'off', vapid: null };

// ---------- helpers ----------
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts });
  if (r.status === 401) { showLogin(); throw new Error('auth'); }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Something went flat');
  return r.json();
}
const post = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
function toast(t, ms = 2400) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), ms); }
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function fmtDay(ts) {
  const d = new Date(ts), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' });
}
const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const isEmojiOnly = s => s.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f|\s)+$/u.test(s) && !/^\d+$/.test(s.trim());

// ---------- sounds (tiny pentatonic "bops") ----------
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

// ---------- boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
async function boot() {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    if (r.status !== 200) return showLogin();
    const me = await r.json();
    state.me = me.me; state.other = me.other; state.vapid = me.vapid; state.otherRead = me.other ? me.other.last_read : 0;
    showChat(me.online);
  } catch { showLogin(); }
}
function showLogin() { $('#chat').classList.add('hidden'); $('#login').classList.remove('hidden'); if (state.ws) { state.ws.onclose = null; state.ws.close(); } }

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); unlockAudio();
  const f = new FormData(e.target); $('#loginErr').textContent = '';
  try {
    const r = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Couldn’t sign in');
    $('#pw').value = ''; boot();
  } catch (err) { $('#loginErr').textContent = err.message; }
});

async function showChat(online) {
  $('#login').classList.add('hidden'); $('#chat').classList.remove('hidden');
  $('#otherName').textContent = state.other.display;
  $('#otherAvatar').textContent = state.other.display === 'Hailey' ? '🌸' : state.other.display === 'Frog' ? '🐸' : state.other.display[0];
  $('#meLine').textContent = `Signed in as ${state.me.display}`;
  setPresence(online);
  state.msgs.clear(); $('#list').innerHTML = ''; state.newest = 0; state.oldest = null;
  const rows = await api('/api/messages');
  rows.forEach(m => addMsg(m, false));
  $('#loadOlder').classList.toggle('hidden', rows.length < 60);
  render(); scrollBottom(true); connect(); markRead();
  updatePushUI();
}

// ---------- realtime ----------
let backoff = 500;
function connect() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  state.ws = ws;
  ws.onopen = () => { backoff = 500; catchUp(); };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.t === 'msg') {
      const mine = m.msg.sender === state.me.id;
      if (addMsg(m.msg, true)) { render(); if (!mine) { showTyping(false); bop('in'); } scrollBottom(mine || nearBottom()); markRead(); }
    } else if (m.t === 'typing' && m.user !== state.me.id) showTyping(m.on);
    else if (m.t === 'presence' && m.user !== state.me.id) setPresence(m.online);
    else if (m.t === 'read' && m.user !== state.me.id) { state.otherRead = m.id; renderReceipt(); }
  };
  ws.onclose = ev => { if (ev.code === 4001) return showLogin(); setTimeout(connect, backoff = Math.min(backoff * 2, 10000)); };
}
async function catchUp() {
  try {
    const rows = await api('/api/messages');
    let added = false; rows.forEach(m => { if (addMsg(m, false)) added = true; });
    if (added) { render(); scrollBottom(nearBottom()); markRead(); }
    const me = await api('/api/me'); setPresence(me.online); state.otherRead = me.other.last_read; renderReceipt();
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.me) { if (!state.ws || state.ws.readyState > 1) connect(); else catchUp(); markRead(); }
});
function setPresence(on) { $('#status').classList.toggle('on', !!on); $('#statusText').textContent = on ? 'here now ♪' : 'away'; }
let typingTimer;
function showTyping(on) {
  clearTimeout(typingTimer);
  const nb = nearBottom();
  $('#typing').classList.toggle('hidden', !on);
  if (on) { typingTimer = setTimeout(() => showTyping(false), 6000); if (nb) scrollBottom(true); }
}
function markRead() {
  if (document.visibilityState !== 'visible' || !state.newest) return;
  if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ t: 'read', id: state.newest }));
  else post('/api/read', { id: state.newest }).catch(() => {});
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

function render() {
  const list = $('#list'); list.innerHTML = '';
  const msgs = [...state.msgs.values()].sort((a, b) => a.id - b.id);
  $('#empty').classList.toggle('hidden', msgs.length > 0);
  let lastDay = '', prev = null;
  for (const m of msgs) {
    const day = new Date(m.created).toDateString();
    if (day !== lastDay) { const d = document.createElement('div'); d.className = 'day'; d.textContent = fmtDay(m.created); list.append(d); lastDay = day; prev = null; }
    const mine = m.sender === state.me.id;
    const el = document.createElement('div');
    el.className = 'msg ' + (mine ? 'me' : 'them');
    if (!prev || prev.sender !== m.sender || m.created - prev.created > 5 * 60e3) el.classList.add('gap');
    if (fresh.has(m.id)) el.classList.add('new');
    el.dataset.id = m.id;
    const b = document.createElement('div'); b.className = 'bubble';
    if (m.kind === 'text') { b.textContent = m.body; if (isEmojiOnly(m.body)) b.classList.add('emoji'); }
    else if (m.kind === 'photo') {
      b.classList.add('photo');
      const img = new Image(); img.loading = 'lazy'; img.alt = 'photo'; img.src = '/media/' + m.file;
      if (m.meta && m.meta.w) { img.width = m.meta.w; img.height = m.meta.h; img.style.height = 'auto'; img.style.aspectRatio = `${m.meta.w}/${m.meta.h}`; img.style.width = Math.min(m.meta.w, 320) + 'px'; }
      img.onload = () => { if (nearBottom()) scrollBottom(true); };
      img.onclick = () => { $('#viewer img').src = img.src; $('#viewer').classList.remove('hidden'); };
      b.append(img);
      if (m.body) { const c = document.createElement('div'); c.className = 'cap'; c.textContent = m.body; b.append(c); }
    } else if (m.kind === 'voice') b.append(voiceEl(m));
    el.append(b);
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.innerHTML = `<span class="time"></span>`; meta.querySelector('.time').textContent = fmtTime(m.created);
    el.append(meta);
    list.append(el); prev = m;
  }
  fresh.clear();
  renderReceipt();
}
function renderReceipt() {
  document.querySelectorAll('.rcpt').forEach(e => e.remove());
  const mine = [...document.querySelectorAll('.msg.me')]; const last = mine[mine.length - 1];
  if (!last) return;
  const id = +last.dataset.id;
  const later = [...state.msgs.values()].some(m => m.id > id && m.sender !== state.me.id);
  if (later) return;
  const s = document.createElement('span'); s.className = 'rcpt';
  s.textContent = state.otherRead >= id ? '♫ Read' : '♪ Delivered';
  last.querySelector('.meta').append(s);
}

// voice note bubble
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
  btn.onclick = () => {
    if (!audio) {
      audio = new Audio('/media/' + m.file); audio.preload = 'auto';
      audio.ontimeupdate = () => {
        const d = isFinite(audio.duration) && audio.duration ? audio.duration : total || 1;
        const frac = audio.currentTime / d; const n = Math.round(frac * peaks.length);
        [...bars.children].forEach((b, i) => b.classList.toggle('on', i < n));
        dur.textContent = fmtDur(audio.currentTime);
      };
      audio.onended = audio.onpause = () => { btn.textContent = '▶'; if (audio.ended) { [...bars.children].forEach(b => b.classList.remove('on')); dur.textContent = fmtDur(total); } };
      audio.onplay = () => { btn.textContent = '❚❚'; };
    }
    if (audio.paused) { if (playing && playing !== audio) playing.pause(); playing = audio; audio.play().catch(() => toast('Could not play that one')); }
    else audio.pause();
  };
  wrap.append(btn, bars, dur);
  return wrap;
}

$('#loadOlder').onclick = async () => {
  const s = $('#scroller'); const h = s.scrollHeight;
  const rows = await api('/api/messages?before=' + state.oldest);
  rows.forEach(m => addMsg(m, false)); render();
  s.scrollTop = s.scrollHeight - h;
  $('#loadOlder').classList.toggle('hidden', rows.length < 60);
};
$('#viewer').onclick = () => $('#viewer').classList.add('hidden');

// ---------- composer ----------
const ta = $('#text');
let typingSent = false, typingIdle;
function sendTyping(on) { if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify({ t: 'typing', on })); typingSent = on; }
ta.addEventListener('input', () => {
  ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  const has = ta.value.trim().length > 0;
  $('#sendBtn').classList.toggle('hidden', !has); $('#micBtn').classList.toggle('hidden', has);
  if (has && !typingSent) sendTyping(true);
  clearTimeout(typingIdle); typingIdle = setTimeout(() => typingSent && sendTyping(false), 3000);
  if (!has && typingSent) sendTyping(false);
});
ta.addEventListener('keydown', e => {
  // on desktop, Enter sends; on phones the return key inserts a newline and the ♪ button sends
  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); sendText(); }
});
$('#sendBtn').addEventListener('click', sendText);
async function sendText() {
  const body = ta.value; if (!body.trim()) return;
  ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); sendTyping(false);
  try { const m = await post('/api/messages', { body }); if (addMsg(m, true)) { render(); scrollBottom(true); } bop('out'); }
  catch (e) { if (e.message !== 'auth') { toast('Didn’t send — check your connection'); ta.value = body; ta.dispatchEvent(new Event('input')); } }
}

async function upload(blob, mime, meta, caption) {
  const headers = { 'Content-Type': mime, 'X-Meta': JSON.stringify(meta || null) };
  if (caption) headers['X-Caption'] = encodeURIComponent(caption);
  const m = await api('/api/upload', { method: 'POST', headers, body: blob });
  if (addMsg(m, true)) { render(); scrollBottom(true); } bop('out');
}

// photos: downscale on device for speed
$('#photoInput').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  toast('Sending photo…', 1500);
  try {
    let blob = file, mime = file.type || 'image/jpeg', w = 0, h = 0;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (bmp) {
      const max = 2048, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
      w = Math.round(bmp.width * sc); h = Math.round(bmp.height * sc);
      if (mime !== 'image/gif') {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); mime = 'image/jpeg';
      }
    }
    await upload(blob, mime, { w, h });
  } catch (err) { if (err.message !== 'auth') toast('Photo didn’t send: ' + err.message); }
});

// voice notes (iOS Safari records audio/mp4)
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
  const chunks = []; const peaks = []; const start = Date.now();
  mr.ondataavailable = e => e.data && e.data.size && chunks.push(e.data);
  // live visualizer
  let an, raf, src;
  if (actx) { src = actx.createMediaStreamSource(stream); an = actx.createAnalyser(); an.fftSize = 512; src.connect(an); }
  const cv = $('#recCanvas'), g = cv.getContext('2d'); const buf = an ? new Uint8Array(an.fftSize) : null; const levels = [];
  function draw() {
    const t = (Date.now() - start) / 1000; $('#recTime').textContent = fmtDur(t);
    if (t > 300) return stop(true);
    let lvl = 0.2 + 0.2 * Math.random();
    if (an) { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2; lvl = Math.min(1, Math.sqrt(s / buf.length) * 4); }
    levels.push(lvl); if (levels.length % 4 === 0) peaks.push(lvl);
    g.clearRect(0, 0, cv.width, cv.height); const n = 60, bw = cv.width / n; const recent = levels.slice(-n);
    recent.forEach((v, i) => { const hh = Math.max(3, v * cv.height); g.fillStyle = i % 2 ? '#ffc861' : '#ff5e8a'; g.fillRect(i * bw + 1, (cv.height - hh) / 2, bw - 2, hh); });
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
      const blob = new Blob(chunks, { type });
      // squash peaks into 32 bars
      const N = 32, out = [];
      for (let i = 0; i < N; i++) { const a = peaks.slice(Math.floor(i * peaks.length / N), Math.ceil((i + 1) * peaks.length / N) || 1); out.push(+(a.length ? Math.max(...a) : 0.2).toFixed(2)); }
      try { await upload(blob, type, { dur: Math.round(dur * 10) / 10, peaks: out }); } catch (e) { if (e.message !== 'auth') toast('Voice note didn’t send'); }
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
$('#soundBtn').textContent = `🎵 Bop sounds: ${state.sound ? 'on' : 'off'}`;
$('#soundBtn').onclick = () => { state.sound = !state.sound; localStorage.sound = state.sound ? 'on' : 'off'; $('#soundBtn').textContent = `🎵 Bop sounds: ${state.sound ? 'on' : 'off'}`; unlockAudio(); bop('in'); };
$('#logoutBtn').onclick = async () => { await post('/api/logout').catch(() => {}); $('#sheet').classList.add('hidden'); showLogin(); };

const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
function updatePushUI() {
  const note = $('#pushNote'), btn = $('#pushBtn');
  if (!state.vapid) { btn.disabled = true; note.textContent = 'Notifications aren’t set up on the server.'; return; }
  if (!('PushManager' in window) || !('Notification' in window)) {
    note.textContent = /iPhone|iPad/.test(navigator.userAgent) && !standalone
      ? 'On iPhone: tap Share → Add to Home Screen, open Flarmalodebop from there, then turn notifications on.'
      : 'This browser doesn’t support notifications.';
    btn.disabled = true; return;
  }
  btn.disabled = false;
  if (Notification.permission === 'granted') { btn.textContent = '🔔 Notifications on — send a test'; note.textContent = 'You’ll get a ping when a new message lands while the app is closed.'; }
  else if (Notification.permission === 'denied') { btn.textContent = '🔕 Notifications blocked'; note.textContent = 'Turn them back on in iPhone Settings → Notifications → Flarmalodebop.'; }
  else { btn.textContent = '🔔 Turn on notifications'; note.textContent = ''; }
}
$('#pushBtn').onclick = async () => {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return updatePushUI();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(state.vapid) });
    await post('/api/push/subscribe', sub.toJSON());
    await post('/api/push/test');
    toast('Notifications on ♪'); updatePushUI();
  } catch (e) { toast('Couldn’t turn on notifications: ' + e.message); }
};
function b64ToU8(s) { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); }

boot();
