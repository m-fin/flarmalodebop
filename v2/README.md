# Flarmalodebop v2 (static + Supabase)

The project README at the repo root is the one to follow for a public checkout. This file is the map of this folder.

The same app as v1 (warm musical theme, live text, photos, voice notes, read receipts, typing, presence, PWA), rebuilt as a **fully static site** on Supabase. On top of that thread: emoji reactions, reply quotes, edit and unsend, message search, and a Dusk / Dawn / Match device appearance.

- `public/`: the site Vercel serves (`config.js` holds the project URL and publishable key; supabase-js v2.119 is vendored at `vendor/supabase.js`)
- `supabase/setup.sql`: one idempotent script for tables, strict RLS, realtime publication, private-channel policies and the private `media` bucket with its policies. Re-running it on an existing project is safe.
- `supabase/migrations/20261115_reactions_replies_edits.sql`: the same reactions, replies, and edit changes, for a database that already ran an older `setup.sql`. It only adds nullable columns, a new table, and two functions. It does not rewrite messages or accounts.
- `supabase/migrations/20261127120000_shared_calendar_restaurant_meetups.sql`: work shifts, favorite restaurants, and one daily restaurant meetup per day. Run it after the lock-down migration on an existing project. Fresh `setup.sql` already includes it. Existing messages and accounts stay put.
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
