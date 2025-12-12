-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES (Publicly visible for collaboration lookup, but only editable by owner)
create table profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  independent_profile jsonb, -- Stores the JSON blob of their "Economic Dream Plan"
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS: Profiles
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);

-- 2. PROJECTS (Private by default, viewable by members)
create table projects (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references auth.users not null,
  name text,
  data jsonb, -- Stores the JSON blob of phases, income, etc.
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS: Projects
alter table projects enable row level security;

-- Policy: Owner has full access
create policy "Owners can do everything." on projects
  for all using (auth.uid() = owner_id);

-- Policy: Collaborators can VIEW (we will implement an 'invite' system later for edit permissions)
-- For the MVP, we might keep it simple: If you know the ID and are in the 'data->teamMembers' list? 
-- Actually, let's keep it simple for now: Public Read, Auth Write? No, that's unsafe.
-- MVP Strategy: Owners Only for now, ensuring the migration works first. 
-- We will add a 'project_members' table later for robust permissioning.

-- 3. PROJECT_MEMBERS (For shared access)
-- (Optional Phase 2: For now we'll store members inside the Project JSON blob, 
-- but RLS won't be able to inspect that easily without advanced queries.
-- Let's stick to Owner-only RLS for the first migration step to avoid complexity.)
