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
