# Flarmalodebop v2 — deploy with dashboard clicks only

Project: **https://bpovuwrgvfzdeihpnssv.supabase.co** (ref `bpovuwrgvfzdeihpnssv`)
Files on the box:
- `/workspace/flarmalodebop/v2/supabase/setup.sql`: schema, RLS, realtime, storage (in the repo, no secrets)
- `/home/box/.secrets/flarmalodebop-v2-users.sql`: creates the 2 users. **Contains passwords. Don't save it as a snippet, and don't paste it anywhere else.**
- `/home/box/.secrets/flarmalodebop-v2.env`: passwords, VAPID keys and the webhook secret (used for push, step 5)
- `/workspace/flarmalodebop/v2/supabase/functions/push/index.ts`: the push edge function

`public/config.js` is already filled with the project URL, the publishable key and the VAPID public key.

---

## 1. Run the setup SQL (Supabase)
1. Supabase dashboard → project → **SQL Editor** → **+ New query**.
2. Paste the **entire** contents of `v2/supabase/setup.sql` → **Run**. If it asks to confirm "destructive operation", confirm: the only delete removes a stray throwaway `smoke-…@example.com` test user.
3. Expected: "Success", with a final result table `username | display` that has **0 rows** (the users don't exist yet). The script is idempotent, so it's safe to re-run.

Already deployed an older `setup.sql`? Paste `v2/supabase/migrations/20261115_reactions_replies_edits.sql` instead of the whole file (or re-run `setup.sql`). It adds `reply_to`, `edited_at`, `message_reactions`, `edit_message()`, and `set_reaction()`. Existing messages, profiles, media, and push rows stay as they are.

## 2. Create the two users (Supabase)
1. SQL Editor → **+ New query** → paste the contents of `/home/box/.secrets/flarmalodebop-v2-users.sql` → **Run**.
2. Expected result: 2 rows, `frog | Frog` and `hailey | Hailey`.
3. **Delete that query snippet** afterwards (⋯ next to it in the left list → Delete), so the passwords don't stay saved in the dashboard.
4. Check: **Authentication → Users** shows exactly `frog@flarmalodebop.app` and `hailey@flarmalodebop.app`. Delete any other user.

The users are inserted straight into `auth.users`, so this works whether signups are on or off.

## 3. Lock down Auth and Realtime (Supabase)
1. **Authentication → Sign In / Providers**: toggle **"Allow new users to sign up" OFF** → **Save**. Keep the Email provider enabled and "Confirm email" OFF.
2. **Authentication → URL Configuration** → Site URL = the Vercel URL from step 4 (optional; no emails are sent).
3. **Realtime → Settings**: turn **"Allow public access" OFF** if the toggle exists, then Save. The app only uses the private channel `flarm:room`.

As a second layer, a database trigger rejects any auth user whose email isn't one of the two, even if signups get switched back on.

## 4. Host the frontend (Vercel)
1. Vercel dashboard → **Add New… → Project** → **Import Git Repository** → `m-fin/flarmalodebop`. It's private, so if it isn't listed, click "Adjust GitHub App Permissions" and grant access to that one repo.
2. Configure:
   - **Project Name:** `flarmalodebop`
   - **Framework Preset:** `Other`
   - **Root Directory:** `v2` (click Edit and select the `v2` folder)
   - **Build Command:** override ON and leave empty (no build)
   - **Output Directory:** override ON → `public`
   - **Install Command:** override ON and leave empty
   - **Environment Variables:** none needed
3. **Deploy**. Production URL will look like `https://flarmalodebop.vercel.app` (or similar).
4. Settings → **Deployment Protection**: keep the default "Standard Protection", which protects previews only. The **production** URL must open without a Vercel login.
5. `v2/vercel.json` already sets the security headers (CSP allows only self and `*.supabase.co`) plus no-cache for `sw.js`/`config.js`.

## 5. Push notifications (optional, all in the dashboard)
1. Supabase → **Edge Functions → Deploy a new function → Via Editor**. Name it **`push`**, replace the template with `v2/supabase/functions/push/index.ts`, then **Deploy**.
2. Open the `push` function → **Details/Settings** → turn **"Verify JWT" / "Enforce JWT verification" OFF** → Save. The function checks its own shared secret header instead.
3. **Edge Functions → Secrets** → add these 4, with values from `/home/box/.secrets/flarmalodebop-v2.env`:
   `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`, `FLARM_WEBHOOK_SECRET`
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.)
4. **Database → Webhooks** (or Integrations → Database Webhooks; click "Enable webhooks" if asked) → **Create a new hook**:
   - **Name:** `flarm_push`
   - **Table:** `public.messages`
   - **Events:** ☑ Insert only
   - **Type:** Supabase Edge Functions → function `push`, method POST, timeout 5000 ms
   - **HTTP Headers:** add `x-flarm-secret` = the `FLARM_WEBHOOK_SECRET` value
   - Leave any "Add auth header with service key" option alone; it isn't needed.
   - **Create webhook**.
5. On each iPhone: Safari → the URL → Share → **Add to Home Screen** → open from the icon → sign in → ⋯ → **Turn on notifications** (needs iOS 16.4+).

## 6. Verify (box)
```bash
cd /workspace/flarmalodebop && node v2/scripts/smoke.js
```
This should print all PASS lines:
- anon can't read anything
- public sign-up is refused
- both members can sign in
- realtime message, typing and presence work
- read receipts work
- private upload and signed URL work
- there's no public URL access

It deletes its own test message and file. It prints no secrets.

## Signing in
Tap 🐸 Frog or 🌸 Hailey and enter the password. Passwords are in `/home/box/.secrets/flarmalodebop-v2.env` (`FROG_PASSWORD`, `HAILEY_PASSWORD`). Frog shares Hailey's himself.
To issue new passwords: `node v2/scripts/gen-secrets.js --rotate`, then re-run step 2.
