-- =====================================================================
-- Flarmalodebop v2 — Supabase setup (idempotent: safe to run again)
-- Paste this WHOLE file into Supabase Dashboard → SQL Editor → Run.
-- Then run the separate users file (kept out of the repo).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Invite list: the only two emails allowed to exist as users
-- ---------------------------------------------------------------------
create table if not exists public.allowed_members (
  email    text primary key,
  username text unique not null,
  display  text not null
);
insert into public.allowed_members (email, username, display) values
  ('frog@flarmalodebop.app',   'frog',   'Frog'),
  ('hailey@flarmalodebop.app', 'hailey', 'Hailey')
on conflict (email) do update set username = excluded.username, display = excluded.display;
alter table public.allowed_members enable row level security;   -- no policies = invisible to the API
revoke all on public.allowed_members from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Profiles (one per member) + read receipts (last_read)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  display    text not null,
  last_read  bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Membership check used by every policy
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = (select auth.uid())) $$;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated, service_role;

-- Block any auth user whose email is not on the invite list (defense in depth;
-- also turn OFF "Allow new users to sign up" in Auth settings).
create or replace function public.flarm_guard_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not in (select email from public.allowed_members) then
    raise exception 'Flarmalodebop is invite-only';
  end if;
  return new;
end $$;
revoke execute on function public.flarm_guard_auth_user() from public, anon, authenticated;
drop trigger if exists flarm_guard_auth_user on auth.users;
create trigger flarm_guard_auth_user
  before insert or update of email on auth.users
  for each row execute function public.flarm_guard_auth_user();

-- Auto-create the profile when an invited auth user is created
create or replace function public.flarm_create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display)
  select new.id, a.username, a.display from public.allowed_members a where a.email = lower(new.email)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.flarm_create_profile() from public, anon, authenticated;
drop trigger if exists flarm_create_profile on auth.users;
create trigger flarm_create_profile
  after insert on auth.users
  for each row execute function public.flarm_create_profile();

-- Remove the throwaway account an early smoke test created before this guard existed (no access anyway)
delete from auth.users where email like 'smoke-%@example.com';

-- Backfill (in case users were created before this script ran)
insert into public.profiles (id, username, display)
select u.id, a.username, a.display
from auth.users u join public.allowed_members a on a.email = lower(u.email)
on conflict (id) do nothing;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using ((select public.is_member()));
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 3. Messages (text / photo / voice)
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  sender     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('text', 'photo', 'voice')),
  body       text not null default '' check (char_length(body) <= 8000),
  file_path  text,
  mime       text,
  meta       jsonb,
  created_at timestamptz not null default now(),
  constraint messages_shape check (
    (kind = 'text' and file_path is null and char_length(btrim(body)) > 0)
    or (kind <> 'text' and file_path is not null)
  )
);
create index if not exists messages_sender_idx on public.messages (sender);
alter table public.messages enable row level security;

drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated using ((select public.is_member()));

drop policy if exists "members send as themselves" on public.messages;
create policy "members send as themselves" on public.messages
  for insert to authenticated with check (
    (select public.is_member())
    and sender = (select auth.uid())
    and (file_path is null or split_part(file_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists "members unsend own" on public.messages;
create policy "members unsend own" on public.messages
  for delete to authenticated using ((select public.is_member()) and sender = (select auth.uid()));

revoke all on public.messages from anon;
revoke update, truncate on public.messages from authenticated;
grant select, insert, delete on public.messages to authenticated;

-- Replies and edits. Both columns stay null on every message that already exists.
alter table public.messages
  add column if not exists reply_to bigint references public.messages(id) on delete set null;
alter table public.messages
  add column if not exists edited_at timestamptz;
create index if not exists messages_reply_to_idx on public.messages (reply_to);

-- Members can change only the words of their own text messages.
create or replace function public.edit_message(p_id bigint, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.messages;
begin
  if not public.is_member() then
    raise exception 'not allowed';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(p_body) > 8000 then
    raise exception 'message is empty';
  end if;
  update public.messages
     set body = p_body,
         edited_at = now()
   where id = p_id
     and sender = (select auth.uid())
     and kind = 'text'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'cannot edit that message';
  end if;
  return v_row;
end
$$;
revoke all on function public.edit_message(bigint, text) from public, anon;
grant execute on function public.edit_message(bigint, text) to authenticated;

-- Sending a message counts as reading everything up to it
create or replace function public.flarm_after_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set last_read = new.id where id = new.sender and last_read < new.id;
  return new;
end $$;
revoke execute on function public.flarm_after_message() from public, anon, authenticated;
drop trigger if exists flarm_after_message on public.messages;
create trigger flarm_after_message after insert on public.messages
  for each row execute function public.flarm_after_message();

-- Read receipts: members can only move their own pointer forward
create or replace function public.mark_read(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_target bigint;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  select least(p_id, coalesce(max(id), 0)) into v_target from public.messages;
  update public.profiles set last_read = v_target where id = auth.uid() and last_read < v_target;
end $$;
revoke execute on function public.mark_read(bigint) from public, anon;
grant execute on function public.mark_read(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 3b. Emoji reactions (one per member per message)
-- ---------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️', '😂', '🐸', '🪿', '🔥', '🎵')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;

drop policy if exists "members read reactions" on public.message_reactions;
create policy "members read reactions" on public.message_reactions
  for select to authenticated
  using ((select public.is_member()));

revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;

create or replace function public.set_reaction(p_message bigint, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from public.messages where id = p_message) then
    raise exception 'no such message';
  end if;
  if p_emoji is null or btrim(p_emoji) = '' then
    delete from public.message_reactions
     where message_id = p_message
       and user_id = (select auth.uid());
    return;
  end if;
  if p_emoji not in ('❤️', '😂', '🐸', '🪿', '🔥', '🎵') then
    raise exception 'pick a flarm reaction';
  end if;
  insert into public.message_reactions (message_id, user_id, emoji)
  values (p_message, (select auth.uid()), p_emoji)
  on conflict (message_id, user_id)
  do update set emoji = excluded.emoji, created_at = now();
end
$$;
revoke all on function public.set_reaction(bigint, text) from public, anon;
grant execute on function public.set_reaction(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Push notification subscriptions + "is the app open" heartbeat
-- ---------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  sub        jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create table if not exists public.activity (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  active_at timestamptz not null default now()
);
alter table public.activity enable row level security;   -- written only via heartbeat()
revoke all on public.activity from anon, authenticated;

create or replace function public.heartbeat()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  insert into public.activity (user_id, active_at) values (auth.uid(), now())
  on conflict (user_id) do update set active_at = now();
end $$;
revoke execute on function public.heartbeat() from public, anon;
grant execute on function public.heartbeat() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Realtime: table changes + private channel (typing / presence)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

-- Only members may join the private channel "flarm:room" (broadcast + presence)
drop policy if exists "flarm members receive" on realtime.messages;
create policy "flarm members receive" on realtime.messages
  for select to authenticated
  using ((select public.is_member()) and (select realtime.topic()) = 'flarm:room');
drop policy if exists "flarm members send" on realtime.messages;
create policy "flarm members send" on realtime.messages
  for insert to authenticated
  with check ((select public.is_member()) and (select realtime.topic()) = 'flarm:room');

-- ---------------------------------------------------------------------
-- 6. Storage: private "media" bucket for photos + voice notes
--    Files live at  <uploader uid>/<random>.<ext>  and are read via signed URLs.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400,
        array['image/jpeg','image/png','image/webp','image/gif',
              'audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/mpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "flarm members read media" on storage.objects;
create policy "flarm members read media" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select public.is_member()));

drop policy if exists "flarm members upload to own folder" on storage.objects;
create policy "flarm members upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_member())
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "flarm members delete own media" on storage.objects;
create policy "flarm members delete own media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_member())
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Done. Quick check (should list 2 rows after the users file has run):
select username, display from public.profiles order by username;
