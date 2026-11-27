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

-- Membership check used by every policy.
-- Lives in a schema the Data API does not expose. authenticated can execute it
-- only so row-level policies can call it; it is not an RPC.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = (select auth.uid())) $$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated, service_role;

-- Block any auth user whose email is not on the invite list (defense in depth;
-- also turn OFF "Allow new users to sign up" in Auth settings).
create or replace function private.flarm_guard_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not in (select email from public.allowed_members) then
    raise exception 'Flarmalodebop is invite-only';
  end if;
  return new;
end $$;
revoke all on function private.flarm_guard_auth_user() from public, anon, authenticated;
drop trigger if exists flarm_guard_auth_user on auth.users;
create trigger flarm_guard_auth_user
  before insert or update of email on auth.users
  for each row execute function private.flarm_guard_auth_user();

-- Auto-create the profile when an invited auth user is created
create or replace function private.flarm_create_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display)
  select new.id, a.username, a.display from public.allowed_members a where a.email = lower(new.email)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.flarm_create_profile() from public, anon, authenticated;
drop trigger if exists flarm_create_profile on auth.users;
create trigger flarm_create_profile
  after insert on auth.users
  for each row execute function private.flarm_create_profile();

-- Remove the throwaway account an early smoke test created before this guard existed (no access anyway)
delete from auth.users where email like 'smoke-%@example.com';

-- Backfill (in case users were created before this script ran)
insert into public.profiles (id, username, display)
select u.id, a.username, a.display
from auth.users u join public.allowed_members a on a.email = lower(u.email)
on conflict (id) do nothing;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using ((select private.is_member()));
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
  for select to authenticated using ((select private.is_member()));

-- Insert policy is created after reply_to / edited_at exist, so a new row
-- cannot pretend to be an edit. See "members send as themselves" below.

drop policy if exists "members unsend own" on public.messages;
create policy "members unsend own" on public.messages
  for delete to authenticated using ((select private.is_member()) and sender = (select auth.uid()));

revoke all on public.messages from anon;
revoke update, truncate on public.messages from authenticated;
grant select, insert, delete on public.messages to authenticated;

-- Replies and edits. Both columns stay null on every message that already exists.
alter table public.messages
  add column if not exists reply_to bigint references public.messages(id) on delete set null;
alter table public.messages
  add column if not exists edited_at timestamptz;
create index if not exists messages_reply_to_idx on public.messages (reply_to);

-- A member sends only as themselves, only into their own media folder,
-- and cannot stamp edited_at. Edits go through edit_message().
drop policy if exists "members send as themselves" on public.messages;
create policy "members send as themselves" on public.messages
  for insert to authenticated with check (
    (select private.is_member())
    and sender = (select auth.uid())
    and edited_at is null
    and (file_path is null or split_part(file_path, '/', 1) = (select auth.uid())::text)
  );

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
  if not private.is_member() then
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
create or replace function private.flarm_after_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set last_read = new.id where id = new.sender and last_read < new.id;
  return new;
end $$;
revoke all on function private.flarm_after_message() from public, anon;
grant execute on function private.flarm_after_message() to authenticated;
drop trigger if exists flarm_after_message on public.messages;
create trigger flarm_after_message after insert on public.messages
  for each row execute function private.flarm_after_message();

-- Read receipts: members can only move their own pointer forward
create or replace function public.mark_read(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_target bigint;
begin
  if not private.is_member() then raise exception 'not allowed'; end if;
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
  using ((select private.is_member()));

revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;

create or replace function public.set_reaction(p_message bigint, p_emoji text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_member() then
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
  using ((select private.is_member()) and user_id = (select auth.uid()))
  with check ((select private.is_member()) and user_id = (select auth.uid()));
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
  if not private.is_member() then raise exception 'not allowed'; end if;
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
  using ((select private.is_member()) and (select realtime.topic()) = 'flarm:room');
drop policy if exists "flarm members send" on realtime.messages;
create policy "flarm members send" on realtime.messages
  for insert to authenticated
  with check ((select private.is_member()) and (select realtime.topic()) = 'flarm:room');

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
  using (bucket_id = 'media' and (select private.is_member()));

drop policy if exists "flarm members upload to own folder" on storage.objects;
create policy "flarm members upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select private.is_member())
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "flarm members delete own media" on storage.objects;
create policy "flarm members delete own media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select private.is_member())
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The Data API roles cannot bypass these policies by owning the tables.
alter table public.allowed_members force row level security;
alter table public.profiles force row level security;
alter table public.messages force row level security;
alter table public.message_reactions force row level security;
alter table public.push_subscriptions force row level security;
alter table public.activity force row level security;

-- Older installs kept these helpers in public, which the Data API exposes.
-- Triggers now call the private copies. Drop the public ones if they remain.
drop function if exists public.is_member();
drop function if exists public.flarm_after_message();
drop function if exists public.flarm_guard_auth_user();
drop function if exists public.flarm_create_profile();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.flarm_guard_auth_user() to supabase_auth_admin;
    grant execute on function private.flarm_create_profile() to supabase_auth_admin;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 7. Shared calendar + daily restaurant meetups
--    Same statements as migrations/20261127120000_shared_calendar_restaurant_meetups.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- Shared calendar + daily restaurant meetups.
-- Safe to re-run. It does not rewrite, delete, or lock existing
-- messages, profiles, media, reactions, or push subscriptions.
--
-- Adds work shifts, one-day exceptions, shared favorite restaurants,
-- and one restaurant meetup per calendar day. Meetup cards are normal
-- text messages tagged in meta. Confirm / counter / cancel go through
-- functions so the card and the calendar stay in step.
--
-- Fresh installs: v2/supabase/setup.sql already includes this.
-- Existing projects: run this file after 20261115060000_private_helpers_and_force_rls.sql.
-- =====================================================================

create table if not exists public.work_shifts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  weekday      smallint check (weekday between 0 and 6),
  on_date      date,
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute   smallint not null check (end_minute between 1 and 1440),
  label        text not null default 'Shift' check (char_length(btrim(label)) between 1 and 40),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint work_shifts_span check (end_minute > start_minute and end_minute - start_minute >= 30),
  constraint work_shifts_when check (
    (weekday is not null and on_date is null)
    or (weekday is null and on_date is not null)
  )
);
create index if not exists work_shifts_user_weekday_idx on public.work_shifts (user_id, weekday);
create index if not exists work_shifts_user_date_idx on public.work_shifts (user_id, on_date);

create table if not exists public.shift_days_off (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  on_date    date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, on_date)
);

create table if not exists public.favorite_spots (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  note       text not null default '' check (char_length(note) <= 160),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists favorite_spots_name_key on public.favorite_spots (lower(btrim(name)));

create table if not exists public.restaurant_meetups (
  id            uuid primary key default gen_random_uuid(),
  day           date not null unique,
  start_minute  smallint not null check (start_minute between 0 and 1439),
  end_minute    smallint not null check (end_minute between 1 and 1440),
  spot_name     text not null check (char_length(btrim(spot_name)) between 1 and 80),
  ride_note     text not null default '' check (char_length(ride_note) <= 200),
  status        text not null default 'proposed' check (status in ('proposed', 'confirmed', 'cancelled')),
  proposed_by   uuid not null references public.profiles(id),
  confirmed_by  uuid references public.profiles(id),
  message_id    bigint references public.messages(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint restaurant_meetups_span check (end_minute > start_minute and end_minute - start_minute >= 30)
);

alter table public.work_shifts enable row level security;
alter table public.shift_days_off enable row level security;
alter table public.favorite_spots enable row level security;
alter table public.restaurant_meetups enable row level security;

drop policy if exists "members read shifts" on public.work_shifts;
create policy "members read shifts" on public.work_shifts
  for select to authenticated using ((select private.is_member()));
drop policy if exists "members insert own shifts" on public.work_shifts;
create policy "members insert own shifts" on public.work_shifts
  for insert to authenticated with check ((select private.is_member()) and user_id = (select auth.uid()));
drop policy if exists "members update own shifts" on public.work_shifts;
create policy "members update own shifts" on public.work_shifts
  for update to authenticated
  using ((select private.is_member()) and user_id = (select auth.uid()))
  with check ((select private.is_member()) and user_id = (select auth.uid()));
drop policy if exists "members delete own shifts" on public.work_shifts;
create policy "members delete own shifts" on public.work_shifts
  for delete to authenticated using ((select private.is_member()) and user_id = (select auth.uid()));

drop policy if exists "members read days off" on public.shift_days_off;
create policy "members read days off" on public.shift_days_off
  for select to authenticated using ((select private.is_member()));
drop policy if exists "members insert own days off" on public.shift_days_off;
create policy "members insert own days off" on public.shift_days_off
  for insert to authenticated with check ((select private.is_member()) and user_id = (select auth.uid()));
drop policy if exists "members delete own days off" on public.shift_days_off;
create policy "members delete own days off" on public.shift_days_off
  for delete to authenticated using ((select private.is_member()) and user_id = (select auth.uid()));

drop policy if exists "members read spots" on public.favorite_spots;
create policy "members read spots" on public.favorite_spots
  for select to authenticated using ((select private.is_member()));
drop policy if exists "members add spots" on public.favorite_spots;
create policy "members add spots" on public.favorite_spots
  for insert to authenticated with check ((select private.is_member()) and created_by = (select auth.uid()));
drop policy if exists "members remove spots" on public.favorite_spots;
create policy "members remove spots" on public.favorite_spots
  for delete to authenticated using ((select private.is_member()));

drop policy if exists "members read meetups" on public.restaurant_meetups;
create policy "members read meetups" on public.restaurant_meetups
  for select to authenticated using ((select private.is_member()));

revoke all on public.work_shifts from anon, authenticated;
grant select, insert, update, delete on public.work_shifts to authenticated;
revoke all on public.shift_days_off from anon, authenticated;
grant select, insert, delete on public.shift_days_off to authenticated;
revoke all on public.favorite_spots from anon, authenticated;
grant select, insert, delete on public.favorite_spots to authenticated;
revoke all on public.restaurant_meetups from anon, authenticated;
grant select on public.restaurant_meetups to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.updated_at = now();
  return new;
end
$fn$;
revoke all on function private.touch_updated_at() from public, anon;
grant execute on function private.touch_updated_at() to authenticated;

drop trigger if exists work_shifts_touch on public.work_shifts;
create trigger work_shifts_touch before update on public.work_shifts
  for each row execute function private.touch_updated_at();
drop trigger if exists restaurant_meetups_touch on public.restaurant_meetups;
create trigger restaurant_meetups_touch before update on public.restaurant_meetups
  for each row execute function private.touch_updated_at();

create or replace function private.fmt_minute(p_minute integer)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select case when (p_minute / 60) % 12 = 0 then 12 else (p_minute / 60) % 12 end::text
    || ':'
    || lpad((p_minute % 60)::text, 2, '0')
    || case when p_minute >= 720 and p_minute < 1440 then ' PM' else ' AM' end
$fn$;

create or replace function private.meetup_summary(
  p_spot text,
  p_day date,
  p_start integer,
  p_end integer,
  p_ride text,
  p_status text
) returns text
language sql
immutable
set search_path = ''
as $fn$
  select '🍽️ Daily Restaurant Meetup' || E'\n'
    || btrim(p_spot) || E'\n'
    || (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from p_day)::int + 1]
    || ', '
    || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p_day)::int]
    || ' ' || extract(day from p_day)::int
    || ' · '
    || private.fmt_minute(p_start) || '–' || private.fmt_minute(p_end)
    || case when coalesce(btrim(p_ride), '') = '' then '' else E'\nRide: ' || btrim(p_ride) end
    || E'\n'
    || case p_status
         when 'confirmed' then 'Locked in'
         when 'cancelled' then 'Cancelled'
         else 'Waiting on a yes'
       end
$fn$;

create or replace function private.upsert_restaurant_meetup(
  p_day date,
  p_start integer,
  p_end integer,
  p_spot text,
  p_ride text
) returns public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.restaurant_meetups;
  v_spot text := btrim(coalesce(p_spot, ''));
  v_ride text := btrim(coalesce(p_ride, ''));
  v_body text;
  v_message bigint;
begin
  if not private.is_member() then
    raise exception 'not allowed';
  end if;
  if p_day is null then
    raise exception 'pick a day';
  end if;
  if p_start is null or p_end is null or p_end <= p_start or p_start < 0 or p_end > 1440 or (p_end - p_start) < 30 then
    raise exception 'pick a real time window';
  end if;
  if char_length(v_spot) < 1 or char_length(v_spot) > 80 then
    raise exception 'name the restaurant';
  end if;
  if char_length(v_ride) > 200 then
    raise exception 'keep the ride note short';
  end if;

  select * into v_row from public.restaurant_meetups where day = p_day;
  if v_row.id is null then
    insert into public.restaurant_meetups (day, start_minute, end_minute, spot_name, ride_note, status, proposed_by)
    values (p_day, p_start, p_end, v_spot, v_ride, 'proposed', v_uid)
    returning * into v_row;
  else
    update public.restaurant_meetups
       set start_minute = p_start,
           end_minute = p_end,
           spot_name = v_spot,
           ride_note = v_ride,
           status = 'proposed',
           proposed_by = v_uid,
           confirmed_by = null
     where id = v_row.id
     returning * into v_row;
  end if;

  v_body := private.meetup_summary(v_row.spot_name, v_row.day, v_row.start_minute, v_row.end_minute, v_row.ride_note, v_row.status);
  if v_row.message_id is null or not exists (select 1 from public.messages where id = v_row.message_id) then
    insert into public.messages (sender, kind, body, file_path, meta)
    values (v_uid, 'text', v_body, null, jsonb_build_object('flarm', 'meetup', 'meetup_id', v_row.id))
    returning id into v_message;
    update public.restaurant_meetups set message_id = v_message where id = v_row.id
    returning * into v_row;
  else
    update public.messages
       set body = v_body,
           meta = jsonb_build_object('flarm', 'meetup', 'meetup_id', v_row.id)
     where id = v_row.message_id;
  end if;
  return v_row;
end
$fn$;
revoke all on function private.upsert_restaurant_meetup(date, integer, integer, text, text) from public, anon, authenticated;

create or replace function private.refresh_meetup_message(p_id uuid)
returns public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.restaurant_meetups;
  v_body text;
begin
  select * into v_row from public.restaurant_meetups where id = p_id;
  if v_row.id is null then
    raise exception 'no such meetup';
  end if;
  v_body := private.meetup_summary(v_row.spot_name, v_row.day, v_row.start_minute, v_row.end_minute, v_row.ride_note, v_row.status);
  if v_row.message_id is not null then
    update public.messages
       set body = v_body,
           meta = jsonb_build_object('flarm', 'meetup', 'meetup_id', v_row.id)
     where id = v_row.message_id;
  end if;
  return v_row;
end
$fn$;
revoke all on function private.refresh_meetup_message(uuid) from public, anon, authenticated;

create or replace function public.propose_meetup(
  p_day date,
  p_start integer,
  p_end integer,
  p_spot text,
  p_ride text
) returns public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  return private.upsert_restaurant_meetup(p_day, p_start, p_end, p_spot, p_ride);
end
$fn$;
revoke all on function public.propose_meetup(date, integer, integer, text, text) from public, anon;
grant execute on function public.propose_meetup(date, integer, integer, text, text) to authenticated;

create or replace function public.propose_meetup_days(p_days jsonb)
returns setof public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_item jsonb;
  v_row public.restaurant_meetups;
  v_ids uuid[] := array[]::uuid[];
begin
  if not private.is_member() then
    raise exception 'not allowed';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) < 1 or jsonb_array_length(p_days) > 14 then
    raise exception 'pick between 1 and 14 days';
  end if;
  for v_item in select value from jsonb_array_elements(p_days)
  loop
    v_row := private.upsert_restaurant_meetup(
      (v_item->>'day')::date,
      (v_item->>'start')::integer,
      (v_item->>'end')::integer,
      v_item->>'spot',
      coalesce(v_item->>'ride', '')
    );
    v_ids := v_ids || v_row.id;
  end loop;
  return query select * from public.restaurant_meetups where id = any (v_ids);
end
$fn$;
revoke all on function public.propose_meetup_days(jsonb) from public, anon;
grant execute on function public.propose_meetup_days(jsonb) to authenticated;

create or replace function public.confirm_meetup(p_id uuid)
returns public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.restaurant_meetups;
begin
  if not private.is_member() then
    raise exception 'not allowed';
  end if;
  select * into v_row from public.restaurant_meetups where id = p_id;
  if v_row.id is null then
    raise exception 'no such meetup';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'that meetup was cancelled';
  end if;
  if v_row.status = 'confirmed' then
    return v_row;
  end if;
  if v_row.proposed_by = v_uid then
    raise exception 'the other person confirms';
  end if;
  update public.restaurant_meetups
     set status = 'confirmed',
         confirmed_by = v_uid
   where id = p_id
   returning * into v_row;
  return private.refresh_meetup_message(v_row.id);
end
$fn$;
revoke all on function public.confirm_meetup(uuid) from public, anon;
grant execute on function public.confirm_meetup(uuid) to authenticated;

create or replace function public.counter_meetup(p_id uuid, p_spot text, p_delta integer)
returns public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.restaurant_meetups;
  v_spot text := btrim(coalesce(p_spot, ''));
  v_start integer;
  v_end integer;
begin
  if not private.is_member() then
    raise exception 'not allowed';
  end if;
  if p_delta is not null and p_delta not in (-30, -15, 15, 30) then
    raise exception 'shift by 15 or 30 minutes';
  end if;
  if v_spot = '' and p_delta is null then
    raise exception 'suggest a spot or a new time';
  end if;
  select * into v_row from public.restaurant_meetups where id = p_id;
  if v_row.id is null then
    raise exception 'no such meetup';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'that meetup was cancelled';
  end if;
  v_start := v_row.start_minute + coalesce(p_delta, 0);
  v_end := v_row.end_minute + coalesce(p_delta, 0);
  if v_start < 0 or v_end > 1440 then
    raise exception 'that moves the meetup off the day';
  end if;
  if v_spot = '' then
    v_spot := v_row.spot_name;
  end if;
  if char_length(v_spot) > 80 then
    raise exception 'name the restaurant';
  end if;
  update public.restaurant_meetups
     set start_minute = v_start,
         end_minute = v_end,
         spot_name = v_spot,
         status = 'proposed',
         proposed_by = v_uid,
         confirmed_by = null
   where id = p_id
   returning * into v_row;
  return private.refresh_meetup_message(v_row.id);
end
$fn$;
revoke all on function public.counter_meetup(uuid, text, integer) from public, anon;
grant execute on function public.counter_meetup(uuid, text, integer) to authenticated;

create or replace function public.cancel_meetup(p_id uuid)
returns public.restaurant_meetups
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.restaurant_meetups;
begin
  if not private.is_member() then
    raise exception 'not allowed';
  end if;
  update public.restaurant_meetups
     set status = 'cancelled',
         confirmed_by = null
   where id = p_id
   returning * into v_row;
  if v_row.id is null then
    raise exception 'no such meetup';
  end if;
  return private.refresh_meetup_message(v_row.id);
end
$fn$;
revoke all on function public.cancel_meetup(uuid) from public, anon;
grant execute on function public.cancel_meetup(uuid) to authenticated;

-- A meetup card is not a normal text edit. Ordinary text messages are unchanged.
create or replace function public.edit_message(p_id bigint, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.messages;
begin
  if not private.is_member() then
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
     and coalesce(meta->>'flarm', '') <> 'meetup'
  returning * into v_row;
  if v_row.id is null then
    raise exception 'cannot edit that message';
  end if;
  return v_row;
end
$fn$;
revoke all on function public.edit_message(bigint, text) from public, anon;
grant execute on function public.edit_message(bigint, text) to authenticated;

do $pub$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'work_shifts') then
    alter publication supabase_realtime add table public.work_shifts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shift_days_off') then
    alter publication supabase_realtime add table public.shift_days_off;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'favorite_spots') then
    alter publication supabase_realtime add table public.favorite_spots;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_meetups') then
    alter publication supabase_realtime add table public.restaurant_meetups;
  end if;
end
$pub$;

-- Members already use flarm:room for the thread. Calendar sync uses flarm:calendar.
drop policy if exists "flarm members receive" on realtime.messages;
create policy "flarm members receive" on realtime.messages
  for select to authenticated
  using ((select private.is_member()) and (select realtime.topic()) in ('flarm:room', 'flarm:calendar'));
drop policy if exists "flarm members send" on realtime.messages;
create policy "flarm members send" on realtime.messages
  for insert to authenticated
  with check ((select private.is_member()) and (select realtime.topic()) in ('flarm:room', 'flarm:calendar'));

alter table public.work_shifts force row level security;
alter table public.shift_days_off force row level security;
alter table public.favorite_spots force row level security;
alter table public.restaurant_meetups force row level security;

-- Done. Quick check (should list 2 rows after the users file has run):
select username, display from public.profiles order by username;
