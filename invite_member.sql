-- 1. Create the Project Members Table
create table if not exists project_members (
    id uuid default uuid_generate_v4() primary key,
    project_id uuid references projects(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    role text default 'editor',
    invited_at timestamp with time zone default timezone('utc'::text, now()),
    unique(project_id, user_id)
);

-- 2. Enable RLS
alter table project_members enable row level security;

-- 3. Policy: Project Owners can manage members
-- (We use a subquery to check if the current user is the owner of the referenced project)
create policy "Project owners can manage members." on project_members
    for all using (
        exists (
            select 1 from projects 
            where projects.id = project_members.project_id 
            and projects.owner_id = auth.uid()
        )
    );

-- 4. Policy: Members can view the list of members for projects they belong to
create policy "Members can view other members in the project." on project_members
    for select using (
        auth.uid() = user_id -- Can see themselves
        or
        exists ( -- Can see others if they are also in the project
            select 1 from project_members as pm
            where pm.project_id = project_members.project_id 
            and pm.user_id = auth.uid()
        )
    );

-- 5. UPDATE PROJECTS POLICY
-- Allow members to SEE the project itself
create policy "Members can view projects they are in." on projects
    for select using (
        exists (
            select 1 from project_members
            where project_members.project_id = projects.id
            and project_members.user_id = auth.uid()
        )
    );
