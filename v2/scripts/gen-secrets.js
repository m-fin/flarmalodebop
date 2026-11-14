// Generates NEW v2 secrets on the box (never printed):
//   /home/box/.secrets/flarmalodebop-v2.env        passwords, VAPID keys, webhook secret (chmod 600)
//   /home/box/.secrets/flarmalodebop-v2-users.sql  SQL that creates/updates the 2 auth users (chmod 600)
// Keeps existing values unless --rotate. Run from repo root:  node v2/scripts/gen-secrets.js
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const webpush = require('web-push');
const DIR = '/home/box/.secrets', ENV = path.join(DIR, 'flarmalodebop-v2.env'), SQL = path.join(DIR, 'flarmalodebop-v2-users.sql');
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const env = {};
if (fs.existsSync(ENV)) for (const l of fs.readFileSync(ENV, 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const rotate = process.argv.includes('--rotate');
const words = ['sax','bop','groove','honk','goose','jazz','swing','riff','tempo','melody','banjo','tuba','cello','disco','funk','waltz','mambo','scat','drum','flute','harp','oboe','piano','samba','tango','vibe','chord','lyric','encore','bebop','cymbal','bongo','kazoo','ukulele','trumpet','violin'];
const phrase = () => Array.from({ length: 4 }, () => words[crypto.randomInt(words.length)]).join('-') + '-' + crypto.randomInt(100, 999);
if (rotate || !env.FROG_PASSWORD) env.FROG_PASSWORD = phrase();
if (rotate || !env.HAILEY_PASSWORD) env.HAILEY_PASSWORD = phrase();
if (!env.VAPID_PUBLIC) { const k = webpush.generateVAPIDKeys(); env.VAPID_PUBLIC = k.publicKey; env.VAPID_PRIVATE = k.privateKey; }
env.VAPID_SUBJECT = env.VAPID_SUBJECT || 'mailto:flarmalodebop@users.noreply.github.com';
if (rotate || !env.FLARM_WEBHOOK_SECRET) env.FLARM_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');
env.FROG_EMAIL = 'frog@flarmalodebop.app'; env.HAILEY_EMAIL = 'hailey@flarmalodebop.app';
fs.writeFileSync(ENV, '# Flarmalodebop v2 secrets — never commit or share\n' + Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
fs.chmodSync(ENV, 0o600);
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const sql = `-- Flarmalodebop v2: create/update the two auth users. CONTAINS PASSWORDS — keep out of git.
-- Run in Supabase SQL Editor AFTER setup.sql. Idempotent (re-running resets the passwords to these values).
do $$
declare v_uid uuid; r record;
begin
  for r in select * from (values
      (${q(env.FROG_EMAIL)}, ${q(env.FROG_PASSWORD)}),
      (${q(env.HAILEY_EMAIL)}, ${q(env.HAILEY_PASSWORD)})
    ) as t(email, pw)
  loop
    select id into v_uid from auth.users where lower(email) = r.email;
    if v_uid is null then
      v_uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, email_change, email_change_token_new, recovery_token)
      values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', r.email,
              extensions.crypt(r.pw, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_uid, v_uid::text,
              jsonb_build_object('sub', v_uid::text, 'email', r.email, 'email_verified', true),
              'email', now(), now(), now());
    else
      update auth.users
         set encrypted_password = extensions.crypt(r.pw, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
       where id = v_uid;
    end if;
  end loop;
end $$;

insert into public.profiles (id, username, display)
select u.id, a.username, a.display
from auth.users u join public.allowed_members a on a.email = lower(u.email)
on conflict (id) do nothing;

select username, display from public.profiles order by username;  -- expect frog + hailey
`;
fs.writeFileSync(SQL, sql, { mode: 0o600 }); fs.chmodSync(SQL, 0o600);
console.log(`Wrote ${ENV} and ${SQL} (values not shown).`);
