# Flarmalodebop v2 (static + Supabase)

The same app as v1 (warm musical theme, live text, photos, voice notes, read receipts, typing, presence, PWA), rebuilt as a **fully static site** on Supabase.

- `public/`: the site Vercel serves (`config.js` holds the project URL and publishable key; supabase-js v2.119 is vendored at `vendor/supabase.js`)
- `supabase/setup.sql`: one idempotent script for tables, strict RLS, realtime publication, private-channel policies and the private `media` bucket with its policies
- `supabase/functions/push/index.ts`: optional Web Push sender, deployed via the dashboard editor and triggered by a DB webhook
- `scripts/`:
  - `gen-secrets.js`: new passwords, VAPID keys and the users SQL, written to `/home/box/.secrets/`, never printed
  - `set-config.sh`: fills config.js
  - `smoke.js`: tests against the real project
  - `ui-check.js`: local headless UI check
- **Goose energy 🪿:**
  - A message that's only 🪿 sends a goose waddling across with a soft honk.
  - 5+ geese, or "the flock has assembled", sends a V formation flying over the chat.
  - The honk follows the sound toggle, and both effects respect reduced-motion.
- Deployment: see `DEPLOY_STEPS.md`.

Local preview: `cd v2/public && python3 -m http.server 8793 --bind 127.0.0.1`, then open http://127.0.0.1:8793
