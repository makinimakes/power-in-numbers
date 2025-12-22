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

-- ==========================================
-- NEW: PROJECT INVITES (For users not yet on the platform)
-- ==========================================

create table if not exists project_invites (
    id uuid default uuid_generate_v4() primary key,
    project_id uuid references projects(id) on delete cascade not null,
    email text not null,
    invited_by uuid references auth.users(id),
    status text default 'pending', -- pending, accepted
    created_at timestamp with time zone default timezone('utc'::text, now()),
    unique(project_id, email)
);

alter table project_invites enable row level security;

-- Policy: Owners can Insert Invites
create policy "Owners can create invites" on project_invites
    for insert with check (
        exists (
            select 1 from projects 
            where projects.id = project_invites.project_id 
            and projects.owner_id = auth.uid()
        )
    );

-- Policy: Owners can View Invites
create policy "Owners can view invites" on project_invites
    for select using (
        exists (
            select 1 from projects 
            where projects.id = project_invites.project_id 
            and projects.owner_id = auth.uid()
        )
    );

-- Function to CLAIM invites (Run this when a user signs up or signs in)
create or replace function claim_invites()
returns void as $$
declare
    usr_email text;
    inv record;
begin
    -- Get current user email
    select email into usr_email from auth.users where id = auth.uid();
    
    if usr_email is null then
        return;
    end if;

    -- Find pending invites for this email (Case Insensitive Match)
    for inv in select * from project_invites 
               where lower(email) = lower(usr_email) 
               and status = 'pending'
    loop
        -- Add to members
        insert into project_members (project_id, user_id, role)
        values (inv.project_id, auth.uid(), 'editor')
        on conflict do nothing;

        -- Update invite status
        update project_invites set status = 'accepted' where id = inv.id;
    end loop;
end;
$$ language plpgsql security definer;
