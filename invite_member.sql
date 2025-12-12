-- INSTRUCTIONS:
-- 1. Copy this entire script.
-- 2. Go to your Supabase Dashboard -> SQL Editor.
-- 3. Paste and Run.

-- 1. Create project_members table
create table if not exists project_members (
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users not null,
  role text default 'editor', -- 'owner', 'editor', 'viewer'
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (project_id, user_id)
);

-- 2. Enable RLS
alter table project_members enable row level security;

-- 3. Policies for project_members
-- Owners can add members
create policy "Owners can manage members" on project_members
  for all using (
    exists (
      select 1 from projects
      where projects.id = project_members.project_id
      and projects.owner_id = auth.uid()
    )
  );

-- Members can view their own membership (and others in the same project)
create policy "Members can view team" on project_members
  for select using (
    auth.uid() = user_id 
    or 
    exists (
      select 1 from project_members as pm
      where pm.project_id = project_members.project_id
      and pm.user_id = auth.uid()
    )
  );

-- 4. UPDATE Policies for PROJECTS table to allow members to ACCESS
-- (We need to update the existing policies or add new ones)

-- Members can VIEW projects they are in
create policy "Members can view projects" on projects
  for select using (
    auth.uid() = owner_id 
    or 
    exists (
      select 1 from project_members
      where project_members.project_id = projects.id
      and project_members.user_id = auth.uid()
    )
  );

-- Members can UPDATE projects (if we want editors to edit)
create policy "Members can update projects" on projects
  for update using (
    auth.uid() = owner_id 
    or 
    exists (
      select 1 from project_members
      where project_members.project_id = projects.id
      and project_members.user_id = auth.uid()
      and project_members.role = 'editor'
    )
  );
