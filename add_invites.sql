-- NEW: PROJECT INVITES (Run this to add the missing invite feature)

-- 1. Create Invites Table
create table if not exists project_invites (
    id uuid default uuid_generate_v4() primary key,
    project_id uuid references projects(id) on delete cascade not null,
    email text not null,
    invited_by uuid references auth.users(id),
    status text default 'pending', -- pending, accepted
    created_at timestamp with time zone default timezone('utc'::text, now()),
    unique(project_id, email)
);

-- 2. Enable RLS
alter table project_invites enable row level security;

-- 3. Policy: Owners can Insert Invites
-- (Drop if exists to avoid error, or just ignore if it errors)
drop policy if exists "Owners can create invites" on project_invites;
create policy "Owners can create invites" on project_invites
    for insert with check (
        exists (
            select 1 from projects 
            where projects.id = project_invites.project_id 
            and projects.owner_id = auth.uid()
        )
    );

-- 4. Policy: Owners can View Invites
drop policy if exists "Owners can view invites" on project_invites;
create policy "Owners can view invites" on project_invites
    for select using (
        exists (
            select 1 from projects 
            where projects.id = project_invites.project_id 
            and projects.owner_id = auth.uid()
        )
    );

-- 5. Function to CLAIM invites (Run this when a user signs up or signs in)
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

    -- Find pending invites for this email
    for inv in select * from project_invites where email = usr_email and status = 'pending'
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
