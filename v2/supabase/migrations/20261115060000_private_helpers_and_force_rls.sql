-- =====================================================================
-- Lock down an existing Flarmalodebop database.
-- Safe to re-run. Does not rewrite, delete, or lock messages or media.
--
-- Fresh installs already get this from v2/supabase/setup.sql.
-- Existing projects: paste this whole file into the SQL editor and run it
-- (after 20261115_reactions_replies_edits.sql if that has not been run).
--
-- What changes:
--   * is_member() and the auth/message triggers move to schema private,
--     which is not exposed by the Data API.
--   * Every policy now calls private.is_member().
--   * Inserts cannot set edited_at (edits stay on edit_message()).
--   * FORCE ROW LEVEL SECURITY on the app tables.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = (select auth.uid())) $$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated, service_role;

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

drop trigger if exists flarm_guard_auth_user on auth.users;
create trigger flarm_guard_auth_user
  before insert or update of email on auth.users
  for each row execute function private.flarm_guard_auth_user();

drop trigger if exists flarm_create_profile on auth.users;
create trigger flarm_create_profile
  after insert on auth.users
  for each row execute function private.flarm_create_profile();

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

-- Client RPCs stay in public (the app calls them) but check membership
-- through the private helper.
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

alter table public.messages
  add column if not exists edited_at timestamptz;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles
  for select to authenticated using ((select private.is_member()));

drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated using ((select private.is_member()));

drop policy if exists "members send as themselves" on public.messages;
create policy "members send as themselves" on public.messages
  for insert to authenticated with check (
    (select private.is_member())
    and sender = (select auth.uid())
    and edited_at is null
    and (file_path is null or split_part(file_path, '/', 1) = (select auth.uid())::text)
  );

drop policy if exists "members unsend own" on public.messages;
create policy "members unsend own" on public.messages
  for delete to authenticated using ((select private.is_member()) and sender = (select auth.uid()));

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (emoji in ('❤️', '😂', '🐸', '🪿', '🔥', '🎵')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;

drop policy if exists "members read reactions" on public.message_reactions;
create policy "members read reactions" on public.message_reactions
  for select to authenticated
  using ((select private.is_member()));

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using ((select private.is_member()) and user_id = (select auth.uid()))
  with check ((select private.is_member()) and user_id = (select auth.uid()));

drop policy if exists "flarm members receive" on realtime.messages;
create policy "flarm members receive" on realtime.messages
  for select to authenticated
  using ((select private.is_member()) and (select realtime.topic()) = 'flarm:room');
drop policy if exists "flarm members send" on realtime.messages;
create policy "flarm members send" on realtime.messages
  for insert to authenticated
  with check ((select private.is_member()) and (select realtime.topic()) = 'flarm:room');

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

alter table public.allowed_members force row level security;
alter table public.profiles force row level security;
alter table public.messages force row level security;
alter table public.message_reactions force row level security;
alter table public.push_subscriptions force row level security;
alter table public.activity force row level security;

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
