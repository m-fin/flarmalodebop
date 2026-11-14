'use strict';
// One-time setup: creates exactly two accounts + VAPID keys, writes them to the secrets file (chmod 600).
// Re-running keeps existing values unless --rotate is passed. Prints NO secrets.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webpush = require('web-push');
const FILE = process.env.FLARM_SECRETS || '/home/box/.secrets/flarmalodebop.env';
fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 });
const env = {};
if (fs.existsSync(FILE)) for (const l of fs.readFileSync(FILE, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const rotate = process.argv.includes('--rotate');
const words = ['sax','bop','groove','honk','goose','jazz','swing','riff','tempo','melody','banjo','tuba','cello','disco','funk','waltz','mambo','scat','drum','flute','harp','oboe','piano','samba','tango','vibe','chord','lyric','encore','bebop'];
const phrase = () => Array.from({ length: 3 }, () => words[crypto.randomInt(words.length)]).join('-') + '-' + crypto.randomInt(10, 99);
if (rotate || !env.FROG_PASSWORD) env.FROG_PASSWORD = phrase();
if (rotate || !env.HAILEY_PASSWORD) env.HAILEY_PASSWORD = phrase();
if (!env.VAPID_PUBLIC) { const k = webpush.generateVAPIDKeys(); env.VAPID_PUBLIC = k.publicKey; env.VAPID_PRIVATE = k.privateKey; }
env.VAPID_SUBJECT = env.VAPID_SUBJECT || 'mailto:flarmalodebop@users.noreply.github.com';
fs.writeFileSync(FILE, '# Flarmalodebop secrets — do not share or commit\n# Sign-in usernames: frog / hailey\n' + Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
fs.chmodSync(FILE, 0o600);
process.env.FLARM_SECRETS = '/dev/null';
const { db, hashPw } = require('./server.js');
const up = db.prepare(`INSERT INTO users (username, display, pw, color) VALUES (?,?,?,?)
  ON CONFLICT(username) DO UPDATE SET pw=excluded.pw, display=excluded.display, color=excluded.color`);
up.run('frog', 'Frog', hashPw(env.FROG_PASSWORD), '#2fbf71');
up.run('hailey', 'Hailey', hashPw(env.HAILEY_PASSWORD), '#ff6f91');
if (rotate) db.exec('DELETE FROM sessions');
const n = db.prepare('SELECT COUNT(*) c FROM users').get().c;
console.log(`Accounts ready (${n} total). Secrets written to ${FILE} (values not shown).`);
