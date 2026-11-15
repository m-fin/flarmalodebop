-- =====================================================================
-- Additive migration for an existing Flarmalodebop project.
-- Safe to re-run. It does not rewrite, delete, or lock existing
-- messages, profiles, media, or push subscriptions.
--
-- Adds:
--   messages.reply_to   — quote another message (null on the old rows)
--   messages.edited_at  — set only by edit_message()
--   message_reactions   — one emoji per member per message
--   edit_message()      — members may change the body of their own text
--   set_reaction()      — members may set or clear their own reaction
--
-- Fresh installs: v2/supabase/setup.sql already includes this.
-- Existing projects: paste this file into the Supabase SQL editor and run it.
-- =====================================================================

alter table public.messages
  add column if not exists reply_to bigint references public.messages(id) on delete set null;

alter table public.messages
  add column if not exists edited_at timestamptz;

create index if not exists messages_reply_to_idx on public.messages (reply_to);

-- One reaction per member per message. Writes go through set_reaction().
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

-- Empty emoji clears your reaction. Any other value must be one of the six.
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

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;
