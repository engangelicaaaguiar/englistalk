-- Supabase schema for EnglisTalk
-- 1) profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_pro boolean default false,
  credits integer default 10
);

-- 2) messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

-- 3) trigger to create profile when user created
create function public.handle_new_user() returns trigger language plpgsql as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists create_user_profile on auth.users;
create trigger create_user_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4) RLS policies
alter table public.profiles enable row level security;
drop policy if exists "Profiles: owner can select and update" on public.profiles;
create policy "Profiles: owner can select and update" on public.profiles
  for select, update using (auth.uid() = id) with check (auth.uid() = id);

alter table public.messages enable row level security;
drop policy if exists "Messages: owner can access" on public.messages;
create policy "Messages: owner can access" on public.messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Waitlist Talken Pro
create table if not exists public.waitlist_pro (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

-- Core learning progression tables (CEFR A1-C2)
create table if not exists public.users_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_level text not null default 'A1' check (current_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  current_module text not null default 'Daily_Conversation',
  xp_points integer not null default 0,
  streak_days integer not null default 0,
  settings jsonb not null default '{"tts_speed":0.75,"show_subtitles":true,"correction_mode":"friendly","voice":"en-US"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vocabulary_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  level_tag text not null check (level_tag in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  status text not null default 'weak' check (status in ('weak', 'learning', 'mastered')),
  times_heard integer not null default 0,
  times_spoken_correctly integer not null default 0,
  times_spoken_incorrectly integer not null default 0,
  last_mistake_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, word, level_tag)
);

create index if not exists idx_vocabulary_mastery_user_level
  on public.vocabulary_mastery (user_id, level_tag, status, updated_at desc);

-- update updated_at automatically
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_progress_updated_at on public.users_progress;
create trigger trg_users_progress_updated_at
  before update on public.users_progress
  for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_vocabulary_mastery_updated_at on public.vocabulary_mastery;
create trigger trg_vocabulary_mastery_updated_at
  before update on public.vocabulary_mastery
  for each row execute procedure public.touch_updated_at();

-- RLS for progression data
alter table public.users_progress enable row level security;
drop policy if exists "UsersProgress: owner can access" on public.users_progress;
create policy "UsersProgress: owner can access" on public.users_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.vocabulary_mastery enable row level security;
drop policy if exists "VocabularyMastery: owner can access" on public.vocabulary_mastery;
create policy "VocabularyMastery: owner can access" on public.vocabulary_mastery
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pedagogical brain (TBLT + Dogme ELT)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'talken_phase') then
    create type public.talken_phase as enum (
      'pre_task',
      'task_cycle',
      'planning_refine',
      'report',
      'language_focus'
    );
  end if;
end $$;

create table if not exists public.talken_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level_tag text not null check (level_tag in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  module_tag text not null,
  phase public.talken_phase not null default 'pre_task',
  scenario text not null default 'daily conversation',
  task_goal text not null default 'keep a natural conversation with high student talking time',
  turn_count integer not null default 0,
  stt_student_tokens integer not null default 0,
  stt_teacher_tokens integer not null default 0,
  language_gap_count integer not null default 0,
  is_active boolean not null default true,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talken_sessions_user_active
  on public.talken_sessions (user_id, is_active, updated_at desc);

create table if not exists public.talken_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talken_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_index integer not null,
  phase public.talken_phase not null,
  user_text text not null,
  assistant_text text not null,
  scenario_role text,
  introduced_word text,
  lexical_chunk text,
  student_token_count integer not null default 0,
  teacher_token_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(session_id, turn_index)
);

create index if not exists idx_talken_turns_session
  on public.talken_turns (session_id, turn_index desc);

create table if not exists public.talken_emergent_language (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talken_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_turn_id uuid references public.talken_turns(id) on delete set null,
  chunk text not null,
  status text not null default 'new' check (status in ('new', 'recycled', 'mastered')),
  occurrences integer not null default 1,
  last_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, chunk)
);

create index if not exists idx_talken_emergent_user
  on public.talken_emergent_language (user_id, status, updated_at desc);

create table if not exists public.talken_language_gaps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.talken_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_turn_id uuid references public.talken_turns(id) on delete set null,
  phase public.talken_phase not null,
  gap_type text not null check (gap_type in ('grammar', 'lexical', 'collocation', 'pronunciation', 'fluency')),
  student_attempt text not null,
  target_upgrade text not null,
  severity smallint not null default 1 check (severity between 1 and 3),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talken_gaps_user
  on public.talken_language_gaps (user_id, resolved, created_at desc);

drop trigger if exists trg_talken_sessions_updated_at on public.talken_sessions;
create trigger trg_talken_sessions_updated_at
  before update on public.talken_sessions
  for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_talken_emergent_updated_at on public.talken_emergent_language;
create trigger trg_talken_emergent_updated_at
  before update on public.talken_emergent_language
  for each row execute procedure public.touch_updated_at();

drop trigger if exists trg_talken_gaps_updated_at on public.talken_language_gaps;
create trigger trg_talken_gaps_updated_at
  before update on public.talken_language_gaps
  for each row execute procedure public.touch_updated_at();

alter table public.talken_sessions enable row level security;
drop policy if exists "TalkenSessions: owner can access" on public.talken_sessions;
create policy "TalkenSessions: owner can access" on public.talken_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.talken_turns enable row level security;
drop policy if exists "TalkenTurns: owner can access" on public.talken_turns;
create policy "TalkenTurns: owner can access" on public.talken_turns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.talken_emergent_language enable row level security;
drop policy if exists "TalkenEmergent: owner can access" on public.talken_emergent_language;
create policy "TalkenEmergent: owner can access" on public.talken_emergent_language
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.talken_language_gaps enable row level security;
drop policy if exists "TalkenGaps: owner can access" on public.talken_language_gaps;
create policy "TalkenGaps: owner can access" on public.talken_language_gaps
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
