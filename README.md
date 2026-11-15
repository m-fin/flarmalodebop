# Flarmalodebop ♫

A tiny private messaging app for exactly two people (Frog + Hailey). Installable iPhone PWA.

## Features
- Real-time text chat (WebSocket) with timestamps, day separators, big-emoji messages
- Photos (downscaled on-device to ≤2048px JPEG), tap to view full screen
- Voice notes via MediaRecorder (iOS Safari records `audio/mp4`), live waveform, playback with progress bars
- Read receipts (♪ Delivered / ♫ Read), typing indicator (bouncing notes), online presence
- Web Push notifications (iOS 16.4+ when added to Home Screen) via VAPID
- Little pentatonic "bop" sounds; warm sunset/plum musical theme; safe-area aware; offline app shell

## Security
- Exactly two accounts created by `setup.js`; **no signup endpoint exists**
- Passwords hashed with scrypt; HttpOnly + Secure + SameSite=Strict session cookie
- Login rate limit (8 tries / 15 min per IP); all API, WebSocket and media require a session
- Strict CSP, HSTS, noindex; media files have random 128-bit names and still require auth
- Secrets (passwords, VAPID keys) live in an env file outside the repo (default `/home/box/.secrets/flarmalodebop.env`, chmod 600). Nothing is committed.

## Run
```bash
npm install
node setup.js            # creates the 2 accounts + VAPID keys (prints no secrets). --rotate to issue new passwords
./run.sh                 # server on 127.0.0.1:8787 (PORT to change); TUNNEL=1 adds a Cloudflare quick tunnel
```
Must be served over HTTPS (reverse proxy / tunnel / PaaS). Env: `PORT`, `DATA_DIR` (SQLite + uploads), `FLARM_SECRETS`.

Stack: Node 22.5+ (built-in `node:sqlite`), Express, ws, web-push. No external services.

## Install on iPhone
Open the URL in Safari → Share → **Add to Home Screen** → open from the icon → sign in → ⋯ → Turn on notifications.

The native app is in `ios-app/` (Expo, bundle id `app.flarmalodebop.ios`). It uses this same Supabase project. TestFlight steps are in `ios-app/TESTFLIGHT.md`.
