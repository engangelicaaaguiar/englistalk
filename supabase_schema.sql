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
create policy "Profiles: owner can select and update" on public.profiles
  for select, update using (auth.uid() = id) with check (auth.uid() = id);

alter table public.messages enable row level security;
create policy "Messages: owner can access" on public.messages
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
