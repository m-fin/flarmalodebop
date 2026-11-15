# Security

Flarmalodebop is a messenger for two invited people. The source is fine to publish. The live database is not.

## Report a problem

Open a private security advisory or an issue on [github.com/m-fin/flarmalodebop](https://github.com/m-fin/flarmalodebop) if the issue does not include a secret, a password, or someone else's messages. Do not file a public issue that contains a key or a message dump.

## What is safe to commit

- The Supabase project URL
- The Supabase publishable key (`sb_publishable_…`) or the legacy anon key
- The VAPID **public** key

Those values ship in the browser and in the iOS app. They only stay safe while Row Level Security is enabled and signups stay off.

## What must never be committed

- `service_role` key, secret key, or database password / `DATABASE_URL`
- JWT secret
- Member passwords, or the SQL file that inserts them
- VAPID **private** key
- `FLARM_WEBHOOK_SECRET`
- Apple distribution certificates, `.p8` keys, or provisioning profiles
- Chat exports, screenshots of a real conversation, phone numbers, or home addresses

`.env`, `.env.*`, and `*.env` are gitignored. `.env.example` is the only env file that belongs in git, and it has placeholders.

## How access works

- Exactly two emails are allowed. A trigger rejects any other auth user. Leave **Allow new users to sign up** off in the Supabase dashboard.
- Every app table has Row Level Security forced on. The anon role has no grants. A signed-in member can read the one shared thread and can send only as themselves.
- `is_member()` and the triggers live in the `private` schema. Do not add `private` to the Data API exposed schemas.
- Edits go through `edit_message()`. Direct `UPDATE` on messages is revoked, and inserts cannot set `edited_at`.
- Reactions are written only by `set_reaction()`.
- Push subscription rows are visible only to their owner.
- The `media` bucket is private. Files are read with signed URLs. Uploads must sit in the sender's own folder.
- Messages are encrypted in transit. They are **not** end-to-end encrypted.

## Before you point this at a new project

Run `v2/supabase/setup.sql` in the SQL editor. On a database created from an older copy of that file, also run `v2/supabase/migrations/20261115060000_private_helpers_and_force_rls.sql`. Then confirm, with the publishable key and no user session, that `GET /rest/v1/messages` is denied.
