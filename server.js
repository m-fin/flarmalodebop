'use strict';
// Flarmalodebop — a private, two-person messaging app.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const webpush = require('web-push');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const PORT = +process.env.PORT || 8787;

// ---------- config / secrets (loaded from env file, never logged) ----------
const SECRETS_FILE = process.env.FLARM_SECRETS || '/home/box/.secrets/flarmalodebop.env';
if (fs.existsSync(SECRETS_FILE)) {
  for (const line of fs.readFileSync(SECRETS_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const pushReady = !!(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE);
if (pushReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

// ---------- database ----------
const db = new DatabaseSync(path.join(DATA, 'flarm.db'));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, display TEXT, pw TEXT, last_read INTEGER DEFAULT 0, color TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender INTEGER, kind TEXT, body TEXT, file TEXT, mime TEXT, meta TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER, sub TEXT);
`);

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return salt.toString('hex') + ':' + h.toString('hex');
}
function checkPw(pw, stored) {
  if (!stored) return false;
  const [s, h] = stored.split(':');
  const got = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  return crypto.timingSafeEqual(got, Buffer.from(h, 'hex'));
}
module.exports = { db, hashPw };
if (require.main !== module) return;

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' wss: ws:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; frame-ancestors 'none'",
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
});

function parseCookies(h) {
  const o = {};
  (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function userFromReq(req) {
  const t = parseCookies(req.headers.cookie).flarm;
  if (!t) return null;
  const s = db.prepare('SELECT user_id FROM sessions WHERE token=?').get(t);
  if (!s) return null;
  return db.prepare('SELECT id, username, display, last_read, color FROM users WHERE id=?').get(s.user_id);
}
function auth(req, res, next) {
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error: 'not signed in' });
  req.user = u; next();
}

// login rate limit (per IP)
const attempts = new Map();
app.post('/api/login', express.json({ limit: '4kb' }), (req, res) => {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 8) return res.status(429).json({ error: 'Too many tries — take a breather and try again in 15 minutes.' });
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').toLowerCase().trim());
  if (!u || !checkPw(String(password || ''), u.pw)) {
    a.n++; attempts.set(ip, a);
    return res.status(401).json({ error: 'That name/password combo is off-key.' });
  }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, u.id, Date.now());
  res.set('Set-Cookie', `flarm=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 365}`);
  res.json({ ok: true });
});
app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(parseCookies(req.headers.cookie).flarm);
  res.set('Set-Cookie', 'flarm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  const other = db.prepare('SELECT id, display, last_read, color FROM users WHERE id<>?').get(req.user.id);
  res.json({ me: req.user, other, online: other ? isOnline(other.id) : false, vapid: pushReady ? process.env.VAPID_PUBLIC : null });
});

function rowOut(r) { return { ...r, meta: r.meta ? JSON.parse(r.meta) : null }; }
app.get('/api/messages', auth, (req, res) => {
  const before = +req.query.before || 9e15;
  const rows = db.prepare('SELECT * FROM messages WHERE id<? ORDER BY id DESC LIMIT 60').all(before).reverse();
  res.json(rows.map(rowOut));
});

app.post('/api/messages', auth, express.json({ limit: '32kb' }), (req, res) => {
  const body = String((req.body || {}).body || '').slice(0, 8000);
  if (!body.trim()) return res.status(400).json({ error: 'empty' });
  res.json(addMessage(req.user, 'text', body, null, null, null));
});

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };
app.post('/api/upload', auth, express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  const ext = ALLOWED[mime];
  if (!ext || !req.body || !req.body.length) return res.status(400).json({ error: 'unsupported file' });
  const kind = mime.startsWith('image/') ? 'photo' : 'voice';
  const name = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS, name), req.body);
  let meta = null;
  try { meta = JSON.parse(req.headers['x-meta'] || 'null'); } catch {}
  res.json(addMessage(req.user, kind, String(req.headers['x-caption'] ? decodeURIComponent(req.headers['x-caption']) : '').slice(0, 2000), name, mime, meta));
});

app.get('/media/:name', auth, (req, res) => {
  const name = path.basename(req.params.name);
  const row = db.prepare('SELECT mime FROM messages WHERE file=?').get(name);
  if (!row) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(row.mime);
  res.sendFile(path.join(UPLOADS, name));
});

app.post('/api/read', auth, express.json(), (req, res) => {
  const id = +(req.body || {}).id || 0;
  markRead(req.user.id, id);
  res.json({ ok: true });
});

app.post('/api/push/subscribe', auth, express.json({ limit: '8kb' }), (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).end();
  db.prepare('INSERT OR REPLACE INTO push_subs VALUES (?,?,?)').run(sub.endpoint, req.user.id, JSON.stringify(sub));
  res.json({ ok: true });
});
app.post('/api/push/test', auth, async (req, res) => {
  await pushTo(req.user.id, { title: 'Flarmalodebop', body: 'Notifications are on. ♪ bop!' });
  res.json({ ok: true });
});

// static
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders(res, p) {
    if (p.endsWith('sw.js') || p.endsWith('.html') || p.endsWith('.webmanifest')) res.set('Cache-Control', 'no-cache');
  },
}));

// ---------- realtime ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const sockets = new Map(); // userId -> Set(ws)
function isOnline(uid) { return (sockets.get(uid) || new Set()).size > 0; }
function broadcast(obj) { const s = JSON.stringify(obj); for (const set of sockets.values()) for (const ws of set) if (ws.readyState === 1) ws.send(s); }

wss.on('connection', (ws, req) => {
  const u = userFromReq(req);
  if (!u) return ws.close(4001, 'auth');
  if (!sockets.has(u.id)) sockets.set(u.id, new Set());
  sockets.get(u.id).add(ws);
  broadcast({ t: 'presence', user: u.id, online: true });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'typing') {
      for (const [uid, set] of sockets) if (uid !== u.id) for (const w of set) w.readyState === 1 && w.send(JSON.stringify({ t: 'typing', user: u.id, on: !!m.on }));
    } else if (m.t === 'read') markRead(u.id, +m.id || 0);
  });
  ws.on('close', () => {
    sockets.get(u.id).delete(ws);
    if (!isOnline(u.id)) broadcast({ t: 'presence', user: u.id, online: false });
  });
});
setInterval(() => { for (const set of sockets.values()) for (const ws of set) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 25000);

function markRead(uid, id) {
  const u = db.prepare('SELECT last_read FROM users WHERE id=?').get(uid);
  const max = db.prepare('SELECT MAX(id) m FROM messages').get().m || 0;
  id = Math.min(id, max);
  if (u && id > u.last_read) {
    db.prepare('UPDATE users SET last_read=? WHERE id=?').run(id, uid);
    broadcast({ t: 'read', user: uid, id });
  }
}

function addMessage(user, kind, body, file, mime, meta) {
  const now = Date.now();
  const r = db.prepare('INSERT INTO messages (sender, kind, body, file, mime, meta, created) VALUES (?,?,?,?,?,?,?)').run(user.id, kind, body, file, mime, meta ? JSON.stringify(meta) : null, now);
  const msg = rowOut(db.prepare('SELECT * FROM messages WHERE id=?').get(Number(r.lastInsertRowid)));
  db.prepare('UPDATE users SET last_read=? WHERE id=?').run(msg.id, user.id);
  broadcast({ t: 'msg', msg });
  const other = db.prepare('SELECT id FROM users WHERE id<>?').get(user.id);
  if (other) {
    const preview = kind === 'text' ? body.slice(0, 120) : kind === 'photo' ? '📷 sent a photo' : '🎙️ sent a voice note';
    pushTo(other.id, { title: user.display, body: preview, tag: 'flarm-msg' }, true);
  }
  return msg;
}

async function pushTo(uid, payload, onlyIfAway) {
  if (!pushReady) return;
  if (onlyIfAway && isOnline(uid)) return; // they're looking at it
  const subs = db.prepare('SELECT * FROM push_subs WHERE user_id=?').all(uid);
  for (const s of subs) {
    try { await webpush.sendNotification(JSON.parse(s.sub), JSON.stringify(payload), { TTL: 3600 }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint=?').run(s.endpoint); }
  }
}

server.listen(PORT, '127.0.0.1', () => console.log(`Flarmalodebop listening on 127.0.0.1:${PORT} (push ${pushReady ? 'on' : 'off'})`));
