-- ========================================
-- StudyLoop — Supabase Schema v2.0
-- Run this in your Supabase SQL Editor
-- ========================================

create extension if not exists "uuid-ossp";

-- ---- Table: users ----
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  daily_goal_hours float not null default 2,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---- Table: sessions ----
create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  is_active boolean not null default true,
  last_heartbeat_at timestamptz not null default now()
);
create index idx_sessions_user_started on public.sessions(user_id, started_at desc);
create index idx_sessions_active on public.sessions(is_active) where is_active = true;

-- ---- Table: subjects ----
create table public.subjects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

-- ---- Table: messages ----
create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index idx_messages_created on public.messages(created_at desc);

-- ---- Table: message_reactions ----
create table public.message_reactions (
  id uuid primary key default uuid_generate_v4(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id, emoji)
);
create index idx_reactions_msg on public.message_reactions(message_id);

-- ========================================
-- Triggers
-- ========================================

-- Auto-create user profile on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'User')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-save subject on session insert
create or replace function public.save_subject_on_session()
returns trigger as $$
begin
  insert into public.subjects (user_id, name)
  values (new.user_id, new.subject)
  on conflict (user_id, name) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_session_insert_save_subject
  after insert on public.sessions
  for each row execute procedure public.save_subject_on_session();

-- Update streaks when session completes
create or replace function public.update_streaks()
returns trigger as $$
declare
  streak int := 0;
  best int;
  d date := current_date;
begin
  if new.is_active = false and old.is_active = true then
    select longest_streak into best from public.users where id = new.user_id;
    loop
      if exists(select 1 from public.sessions where user_id = new.user_id and is_active = false and date(started_at) = d) then
        streak := streak + 1;
        d := d - 1;
      else exit;
      end if;
    end loop;
    if streak > best then best := streak; end if;
    update public.users set current_streak = streak, longest_streak = best where id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_session_completed
  after update on public.sessions
  for each row execute procedure public.update_streaks();

-- ========================================
-- RLS
-- ========================================
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.subjects enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

-- users
create policy "read_users" on public.users for select to authenticated using (true);
create policy "update_own_user" on public.users for update to authenticated using (auth.uid() = id);

-- sessions
create policy "read_sessions" on public.sessions for select to authenticated using (true);
create policy "insert_own_sessions" on public.sessions for insert to authenticated with check (auth.uid() = user_id);
create policy "update_own_sessions" on public.sessions for update to authenticated using (auth.uid() = user_id);

-- subjects
create policy "read_own_subjects" on public.subjects for select to authenticated using (auth.uid() = user_id);
create policy "insert_own_subjects" on public.subjects for insert to authenticated with check (auth.uid() = user_id);

-- messages
create policy "read_messages" on public.messages for select to authenticated using (true);
create policy "insert_own_messages" on public.messages for insert to authenticated with check (auth.uid() = sender_id);

-- message_reactions
create policy "read_reactions" on public.message_reactions for select to authenticated using (true);
create policy "insert_own_reactions" on public.message_reactions for insert to authenticated with check (auth.uid() = user_id);
create policy "delete_own_reactions" on public.message_reactions for delete to authenticated using (auth.uid() = user_id);

-- ========================================
-- Realtime
-- ========================================
drop publication if exists supabase_realtime;
create publication supabase_realtime;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.sessions;

-- ========================================
-- Views
-- ========================================
create or replace view public.active_sessions as
select s.id as session_id, s.user_id, u.display_name, u.avatar_url, s.subject, s.started_at,
       extract(epoch from (now() - s.started_at))::integer as elapsed_seconds
from public.sessions s join public.users u on s.user_id = u.id
where s.is_active = true;

create or replace view public.daily_stats as
select user_id, date(started_at) as session_date, count(*) as session_count, sum(duration_seconds) as total_seconds
from public.sessions where is_active = false
group by user_id, date(started_at);
