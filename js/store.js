/**
 * Data Store
 * Management of localStorage for Power in Numbers
 */

const STORAGE_KEYS = {
    USERS: 'pin_users',       // { username: { password, profile, ...userData } }
    SESSION: 'pin_session',   // "username"
    PROJECT: 'pin_project_budget'
};

// Base categories remain the same, reused for new users
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

const DEFAULT_PROJECT = {
    teamMembers: [], // { id, name, rate, days, username, email }
    expenses: [],    // { id, name, cost }
    incomeSources: [], // { id, name, amount, status: 'Confirmed'|'Likely'|'Unconfirmed' }
    totalBudget: 0
};

const Store = {
    // --- Auth Methods ---

    getUsers: () => {
        const data = localStorage.getItem(STORAGE_KEYS.USERS);
        return data ? JSON.parse(data) : {};
    },

    saveUsers: (users) => {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    },

    getCurrentUser: () => {
        return localStorage.getItem(STORAGE_KEYS.SESSION);
    },

    checkSession: () => {
        const user = Store.getCurrentUser();
        if (!user) {
            // Redirect to login if not on auth pages
            if (!window.location.href.includes('login.html') && !window.location.href.includes('signup.html')) {
                window.location.href = 'login.html';
            }
            return null;
        }
        return user;
    },

    login: (username, password) => {
        const users = Store.getUsers();
        if (users[username] && users[username].password === password) {
            localStorage.setItem(STORAGE_KEYS.SESSION, username);
            return true;
        }
        return false;
    },

    logout: () => {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        window.location.href = 'login.html';
    },

    register: (userData) => {
        const users = Store.getUsers();
        if (users[userData.username]) {
            throw new Error('Username already exists');
        }

        // Initialize with default profile structure
        users[userData.username] = {
            ...userData,
            independentProfile: { ...DEFAULT_INDEPENDENT }
        };

        Store.saveUsers(users);
        // Auto-login after register
        localStorage.setItem(STORAGE_KEYS.SESSION, userData.username);
    },

    updateUser: (username, newUserData) => {
        const users = Store.getUsers();
        if (!users[username]) {
            throw new Error('User not found');
        }

        // Merge new data into existing user object
        // Protect username from being changed here for simplicity
        const updatedUser = {
            ...users[username],
            ...newUserData,
            username: username // Force username to stay same
        };

        users[username] = updatedUser;
        Store.saveUsers(users);
        return updatedUser;
    },

    findUserByEmail: (email) => {
        const users = Store.getUsers();
        // Since users are keyed by username, we iterate
        for (const username in users) {
            if (users[username].email === email) {
                return users[username];
            }
        }
        return null;
    },

    // --- Profile Methods (Scoped to Session) ---

    getIndependentProfile: () => {
        const currentUser = Store.getCurrentUser();
        if (!currentUser) return DEFAULT_INDEPENDENT;

        const users = Store.getUsers();
        const userProfile = users[currentUser].independentProfile || DEFAULT_INDEPENDENT;

        // Shallow merge defaults
        return { ...DEFAULT_INDEPENDENT, ...userProfile };
    },

    saveIndependentProfile: (profile) => {
        const currentUser = Store.getCurrentUser();
        if (!currentUser) return;

        const users = Store.getUsers();
        if (users[currentUser]) {
            users[currentUser].independentProfile = profile;
            Store.saveUsers(users);
            window.dispatchEvent(new CustomEvent('pin-independent-update', { detail: profile }));
        }
    },

    // --- Project Methods ---

    // --- Project Methods ---

    // 1. Get All Projects (Map)
    getProjects: () => {
        let projects = localStorage.getItem('pin_projects');
        if (projects) {
            return JSON.parse(projects);
        }

        // Migration: Check for old single project
        const oldProject = localStorage.getItem(STORAGE_KEYS.PROJECT);
        if (oldProject) {
            const p = JSON.parse(oldProject);
            // Ensure ID and Name
            if (!p.id) p.id = crypto.randomUUID();
            if (!p.name) p.name = "Legacy Project";

            // Create new map
            const newProjects = {};
            newProjects[p.id] = p;

            // Save new, remove old
            localStorage.setItem('pin_projects', JSON.stringify(newProjects));
            localStorage.removeItem(STORAGE_KEYS.PROJECT);
            return newProjects;
        }

        return {};
    },

    // 2. Get Single Project (with Migration)
    getProject: (id) => {
        const projects = Store.getProjects();
        let project = projects[id];
        if (!project) return null;

        // Migration: Add Phases if missing
        if (!project.phases) {
            project.phases = [{
                id: crypto.randomUUID(),
                name: 'Phase 1',
                teamMembers: [], // Use project pool
                lineItems: [], // Move old expenses/team allocs here? 
                // For simplified migration, we keep old team/expenses at root for now
                // and just add the structure. 
                // Ideally, we move 'expenses' to 'lineItems'.
                schedule: { start: '', end: '' }
            }];

            // If project has expenses, move to Phase 1 lineItems
            if (project.expenses && project.expenses.length > 0) {
                project.phases[0].lineItems = project.expenses.map(e => ({
                    ...e,
                    type: 'Expense',
                    phaseId: project.phases[0].id
                }));
                project.expenses = []; // Clear root
            }

            Store.saveProject(project);
        }
        return project;
    },

    // 3. Save Project (Create/Update)
    saveProject: (project) => {
        const projects = Store.getProjects();
        if (!project.id) project.id = crypto.randomUUID();

        // Ensure defaults
        if (!project.teamMembers) project.teamMembers = [];
        if (!project.phases) project.phases = [];
        if (!project.incomeSources) project.incomeSources = [];

        projects[project.id] = project;
        localStorage.setItem('pin_projects', JSON.stringify(projects));
        window.dispatchEvent(new CustomEvent('pin-projects-update', { detail: projects }));
        return project;
    },

    // 4. Create New Project
    createProject: (name) => {
        const currentUser = Store.getCurrentUser();
        const users = Store.getUsers();
        const userProfile = users[currentUser];

        const newProject = {
            id: crypto.randomUUID(),
            name: name,
            owner: currentUser,
            teamMembers: [], // The Pool
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

        // Auto-add creator as first team member (Pool)
        if (userProfile) {
            newProject.teamMembers.push({
                id: crypto.randomUUID(),
                name: userProfile.fullName || currentUser,
                rate: 0,
                days: 0,
                username: currentUser,
                email: userProfile.email
            });
        }

        return Store.saveProject(newProject);
    },

    // Helper: Add Member to Specific Project
    addProjectMember: (projectId, member) => {
        const project = Store.getProject(projectId);
        if (project) {
            member.id = crypto.randomUUID();
            project.teamMembers.push(member);
            Store.saveProject(project);
        }
    },

    // Helper: Remove Member from Specific Project
    removeProjectMember: (projectId, memberId) => {
        const project = Store.getProject(projectId);
        if (project) {
            project.teamMembers = project.teamMembers.filter(m => m.id !== memberId);
            Store.saveProject(project);
        }
    },

    ensureId: (item) => {
        if (!item.id) item.id = crypto.randomUUID();
        return item;
    }
};
