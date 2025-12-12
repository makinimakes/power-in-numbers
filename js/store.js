/**
 * Data Store - Supabase Edition (Async)
 * Wraps Supabase Client for Power in Numbers
 */

const Store = {
    // --- Auth Methods ---

    /**
     * Check current session. Returns string username (email) or null.
     * NOW ASYNC if validating against server, but for speed we can check local session.
     * Supabase handles session auto-refresh.
     */
    checkSession: async () => {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) {
            // Redirect if not on public pages
            if (!window.location.href.includes('login.html') && !window.location.href.includes('signup.html')) {
                window.location.href = 'login.html';
            }
            return null;
        }
        return session.user.email;
    },

    getCurrentUser: async () => {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        return user;
    },

    login: async (email, password) => {
        const cleanEmail = email.trim();

        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: cleanEmail,
            password: password
        });

        if (error) {
            alert("Login Failed: " + error.message);
            console.error(error);
            return false;
        }
        return true;
    },

    logout: async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    },

    register: async (email, password, fullName) => {
        const cleanEmail = email.trim();
        const { data, error } = await window.supabaseClient.auth.signUp({
            email: cleanEmail,
            password: password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });

        if (error) {
            throw new Error(error.message);
        }

        // Create Profile Row
        if (data.user) {
            // Check if profile exists (triggered by trigger? or manual?)
            // Manual creation to be safe
            const { error: profileError } = await window.supabaseClient
                .from('profiles')
                .insert([
                    {
                        id: data.user.id,
                        email: email,
                        full_name: fullName,
                        independent_profile: window.DEFAULT_INDEPENDENT // Init with defaults
                    }
                ]);

            if (profileError) console.error("Profile creation error:", profileError);
        }
    },

    // --- Profile Methods ---

    getIndependentProfile: async () => {
        const user = await Store.getCurrentUser();
        if (!user) return window.DEFAULT_INDEPENDENT;

        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('independent_profile')
            .eq('id', user.id)
            .single();

        if (error) {
            console.error("Error fetching profile:", error);
            return window.DEFAULT_INDEPENDENT;
        }

        // Merge defaults
        return { ...window.DEFAULT_INDEPENDENT, ...data.independent_profile };
    },

    saveIndependentProfile: async (profile) => {
        const user = await Store.getCurrentUser();
        if (!user) return;

        const { error } = await window.supabaseClient
            .from('profiles')
            .update({ independent_profile: profile })
            .eq('id', user.id);

        if (error) {
            console.error("Error saving profile:", error);
            alert("Failed to save profile.");
        } else {
            // Notify local listeners just in case
            window.dispatchEvent(new CustomEvent('pin-independent-update', { detail: profile }));
        }
    },

    // --- Project Methods ---

    /**
     * Get ALL projects (Owned + Shared)
     * Returns Map: { [id]: project }
     */
    getProjects: async () => {
        const user = await Store.getCurrentUser();
        if (!user) return {};

        // 1. Fetch Owned Projects
        const { data: owned, error: err1 } = await window.supabaseClient
            .from('projects')
            .select('*')
            .eq('owner_id', user.id);

        if (err1) throw err1;

        // 2. Fetch Shared Projects
        // Query project_members to find project_ids where user_id = me
        const { data: memberRows, error: err2 } = await window.supabaseClient
            .from('project_members')
            .select('project_id, role')
            .eq('user_id', user.id);

        // If error (e.g. table doesn't exist yet), just return owned.
        let shared = [];
        if (!err2 && memberRows && memberRows.length > 0) {
            const sharedIds = memberRows.map(r => r.project_id);
            if (sharedIds.length > 0) {
                const { data: sharedProjects, error: err3 } = await window.supabaseClient
                    .from('projects')
                    .select('*')
                    .in('id', sharedIds);

                if (!err3 && sharedProjects) {
                    shared = sharedProjects;
                }
            }
        }

        // Merge
        const projects = {};
        [...(owned || []), ...(shared || [])].forEach(p => {
            projects[p.id] = { ...p.data, id: p.id, name: p.name, owner_id: p.owner_id };
        });

        return projects;
    },

    /**
     * Invite a user to a project by email.
     * 1. Check if user exists (requires Public Profiles).
     * 2. Add to project_members.
     */
    init: async () => {
        // Initialize Supabase Client
        if (window.supabase) {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Supabase Client Initialized");

            // Check session and claim invites if logged in
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session) {
                try {
                    await window.supabaseClient.rpc('claim_invites');
                } catch (e) {
                    console.log("Claim Invites check (silent fail):", e);
                }
            }
        } else {
            console.error("Supabase SDK not found!");
        }
    },
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if(session) {
        try {
            await window.supabaseClient.rpc('claim_invites');
        } catch (e) {
            console.log("Claim Invites check (silent fail):", e);
        }
    }
} else {
    console.error("Supabase SDK not found!");
}
},

/**
 * Invite a user to a project by email.
 * 1. Check if user exists (requires Public Profiles).
 * 2. If yes, Add to project_members.
 * 3. If no, Add to project_invites (Pending).
 */
inviteUser: async (projectId, email) => {
    // 1. Try to Find User ID first
    const { data: profileData, error: profileError } = await window.supabaseClient
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

    // 2. If User Found -> Add to Members
    if (profileData && profileData.id) {
        const userId = profileData.id;
        const { error: insertError } = await window.supabaseClient
            .from('project_members')
            .insert([{
                project_id: projectId,
                user_id: userId,
                role: 'editor'
            }]);

        if (insertError) {
            if (insertError.code === '23505') throw new Error("User is already a member.");
            throw insertError;
        }
        return { status: 'added', message: 'User added to project.' };
    }

    // 3. User Not Found -> Add to Invites
    else {
        // We need the current user ID for 'invited_by'
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) throw new Error("You must be logged in to invite.");

        const { error: inviteError } = await window.supabaseClient
            .from('project_invites')
            .insert([{
                project_id: projectId,
                email: email,
                invited_by: user.id
            }]);

        if (inviteError) {
            if (inviteError.code === '23505') throw new Error("User already invited.");
            throw inviteError;
        }
        return { status: 'invited', message: 'User not found. Invite sent (Pending).' };
    }
},

    getProject: async (id) => {
        const { data, error } = await window.supabaseClient
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error("Store.getProject Error:", error);
            // If it's a "Row not found" (PGRST116), return null gracefully.
            if (error.code === 'PGRST116') return null;
            // Otherwise throw
            throw error;
        }

        // Merge
        return { ...data.data, id: data.id, name: data.name, owner_id: data.owner_id };
    },

        saveProject: async (project) => {
            const user = await Store.getCurrentUser();
            if (!user) return;

            const payload = {
                id: project.id, // CRITICAL: Required for Upsert to update existing row
                name: project.name,
                data: project, // Storing full object in JSONB
                owner_id: user.id
            };

            if (project.id && !project.id.includes('-')) {
                // Legacy numeric ID check? No, all UUIDs now.
                // Just proceed to payload.
            }

            // Use UPSERT for simplicity (Insert if new/ID not found, Update if ID found)
            // Note: For this to work, ID must be a primary key.
            const { data, error } = await window.supabaseClient
                .from('projects')
                .upsert(payload)
                .select()
                .single();

            if (error) {
                console.error("Save Project Error", error);
                throw error;
            }

            // Return merged data (DB truth)
            // Ensure we merge back the full 'data' json column into the object structure
            // The DB returns: { id, name, owner_id, data: {...}, created_at }
            // We want to return the 'expanded' object.
            const merged = { ...data.data, id: data.id, name: data.name, owner_id: data.owner_id };
            return merged;
        },

            /**
             * Delete a project by ID
             */
            deleteProject: async (id) => {
                const user = await Store.getCurrentUser();
                if (!user) return;

                // Perform delete
                // RLS policies should prevent deleting projects you don't own
                const { error } = await window.supabaseClient
                    .from('projects')
                    .delete()
                    .eq('id', id);

                if (error) {
                    console.error("Delete Project Error:", error);
                    throw error;
                }
                return true;
            },

                // Helper to find users (for collaboration)
                findUserByEmail: async (email) => {
                    // Requires RLS policy 'Public profiles are viewable by everyone'
                    const { data, error } = await window.supabaseClient
                        .from('profiles')
                        .select('*')
                        .eq('email', email)
                        .single();

                    if (error || !data) return null;

                    return {
                        username: data.email, // Map email to legacy username field
                        email: data.email,
                        fullName: data.full_name,
                        independentProfile: data.independent_profile
                    };
                },

                    // Helper: Map of all users (Deprecated in Async World, but used by Project.js)
                    // We must replace usages of `Store.getUsers()` with individual lookups or a batch fetch.
                    // For now, we can implement a method that fetches ALL profiles if the user base is small, 
                    // OR we change the project logic.
                    // Given the prompt "collaborators to observe", let's try to fetch all needed profiles via `getProjectTeam`.

                    getUsersMap: async (emailsArray) => {
                        if (!emailsArray || emailsArray.length === 0) return {};

                        const { data, error } = await window.supabaseClient
                            .from('profiles')
                            .select('*')
                            .in('email', emailsArray);

                        const map = {};
                        if (data) {
                            data.forEach(p => {
                                map[p.email] = {
                                    username: p.email,
                                    email: p.email,
                                    fullName: p.full_name,
                                    independentProfile: p.independent_profile
                                };
                            });
                        }
                        return map;
                    },

                        createProject: async (name) => {
                            const user = await Store.getCurrentUser();

                            // Fetch full profile for the creator
                            const profile = await Store.getIndependentProfile();

                            const newProject = {
                                id: crypto.randomUUID ? crypto.randomUUID() : undefined, // Let Supabase gen ID if crypto missing
                                name: name,
                                owner: user.email,
                                teamMembers: [],
                                incomeSources: [],
                                phases: [
                                    {
                                        id: crypto.randomUUID(),
                                        name: 'Phase 1',
                                        schedule: {},
                                        lineItems: [],
                                        overrides: {}
                                    }
                                ],
                                totalBudget: 0
                            };

                            // Auto-add creator
                            newProject.teamMembers.push({
                                id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(), // Fallback for file://
                                name: profile.fullName || "Me",
                                rate: 0,
                                days: 0,
                                username: user.email,
                                email: user.email
                            });

                            // Save and Return the DB version (which has the authoritative ID)
                            return await Store.saveProject(newProject);
                        }
};

// Temp helper to check if ID is UUID (server side) vs something else? 
// Supabase handles upsert if we pass ID.
function isNew(id) {
    // If we rely on UPSERT, we don't need this check.
    return false;
}

// Re-export defaults
// Ensure Utils is loaded first or duplicated constants
const BASE_EXPENSE_CATEGORIES = [
    { label: 'Monthly rent/mortgage', type: 'Monthly', frequency: 1 },
    { label: 'Utilities', type: 'Monthly', frequency: 1 },
    { label: 'Internet', type: 'Monthly', frequency: 1 },
    { label: 'Car payments, insurance, & gas, public transportation, Lyft/Uber, etc.', type: 'Monthly', frequency: 1 },
    { label: 'Cell phone', type: 'Monthly', frequency: 1 },
    { label: 'Groceries', type: 'Monthly', frequency: 1 },
    { label: 'Eating Out', type: 'Monthly', frequency: 1 },
    { label: 'Fun', type: 'Monthly', frequency: 1 },
    { label: 'Classes', type: 'Monthly', frequency: 1 },
    { label: 'Research', type: 'Monthly', frequency: 1 },
    { label: 'Clothes', type: 'Monthly', frequency: 1 },
    { label: 'Childcare', type: 'Monthly', frequency: 1 },
    { label: 'Family Support', type: 'Monthly', frequency: 1 },
    { label: 'Insurance and healthcare not covered through employment', type: 'Monthly', frequency: 1 },
    { label: 'Bodywork', type: 'Monthly', frequency: 1 },
    { label: 'Fixed amount credit/debt payment', type: 'Monthly', frequency: 1 },
    { label: 'Vacation', type: 'Periodic', frequency: 1 },
    { label: 'Charity/Giving/Community Investing', type: 'Percent', frequency: 1 },
    { label: 'Savings', type: 'Percent', frequency: 1 },
    { label: 'Credit and/or other debt paydown', type: 'Percent', frequency: 1 },
    { label: 'Retirement', type: 'Percent', frequency: 1 },
    { label: 'Student Loan', type: 'Monthly', frequency: 1 }
];

const DEFAULT_INDEPENDENT = {
    income: 60000,
    schedule: { weeks: 48, days: 4, hours: 6 },
    linesOfWork: [],
    expenses: {
        taxRate: 30,
        items: BASE_EXPENSE_CATEGORIES.map(item => ({
            ...item,
            id: crypto.randomUUID(),
            amount: 0
        }))
    },
    unearnedIncome: {
        items: [
            { id: '1', label: 'Interest', amount: 0, type: 'Annual', frequency: 1 },
            { id: '2', label: 'Dividends', amount: 0, type: 'Annual', frequency: 1 },
            { id: '3', label: 'Capital Gains', amount: 0, type: 'Annual', frequency: 1 },
            { id: '4', label: 'Trust Distributions', amount: 0, type: 'Annual', frequency: 1 },
            { id: '5', label: 'Inheritance', amount: 0, type: 'Annual', frequency: 1 },
            { id: '6', label: 'Passive Rental Income', amount: 0, type: 'Monthly', frequency: 1 },
            { id: '7', label: 'Royalties', amount: 0, type: 'Annual', frequency: 1 },
            { id: '8', label: 'Regularly Received Gifts', amount: 0, type: 'Annual', frequency: 1 },
            { id: '9', label: 'Social Security Income', amount: 0, type: 'Monthly', frequency: 1 },
            { id: '10', label: 'Retirement Income', amount: 0, type: 'Monthly', frequency: 1 },
            { id: '11', label: 'Pension Income', amount: 0, type: 'Monthly', frequency: 1 },
            { id: '12', label: 'Alimony', amount: 0, type: 'Monthly', frequency: 1 },
            { id: '13', label: 'Child Support', amount: 0, type: 'Monthly', frequency: 1 }
        ]
    },
    slidingScalePercentages: {
        items: BASE_EXPENSE_CATEGORIES.map(item => ({
            ...item,
            percent: 4.5
        }))
    },
    calibrations: {
        periodValue: 1,
        periodUnit: 'Years',
        confirmed: [],
        projected: []
    },
    currentNetIncome: 0
};

// Export to window
window.Store = Store;
window.DEFAULT_INDEPENDENT = DEFAULT_INDEPENDENT;
