/**
 * Global Search (Command Palette)
 * Indexes data from Store and provides a quick search interface.
 */

window.GlobalSearch = {
    modal: null,
    input: null,
    resultsContainer: null,
    index: [],
    
    init: async function() {
        if (typeof Store === 'undefined') return;

        this.injectUI();
        this.bindEvents();
        await this.buildIndex();
    },

    injectUI: function() {
        // 1. Inject Search Icon into Header
        const headerDivs = document.querySelectorAll('header > div');
        if (headerDivs.length > 0) {
            const headerNav = headerDivs[headerDivs.length - 1]; // the div with links
            const searchBtn = document.createElement('button');
            searchBtn.innerHTML = '&#128269; Search (Cmd+K)'; // Magnifying glass
            searchBtn.style.background = 'transparent';
            searchBtn.style.border = '1px solid rgba(255,255,255,0.3)';
            searchBtn.style.color = 'var(--color-text-inverse)';
            searchBtn.style.padding = '4px 10px';
            searchBtn.style.borderRadius = '4px';
            searchBtn.style.marginRight = '15px';
            searchBtn.style.cursor = 'pointer';
            searchBtn.style.fontSize = '0.8rem';
            searchBtn.onclick = () => this.open();
            
            // Insert before the first link
            headerNav.insertBefore(searchBtn, headerNav.firstChild);
        }

        // 2. Inject Command Palette Modal
        const modalHtml = `
            <div id="cmd-palette-backdrop" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99999; backdrop-filter:blur(2px); justify-content:center; align-items:flex-start; padding-top:10vh;">
                <div id="cmd-palette-modal" style="background:var(--color-bg-base); width:90%; max-width:600px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.2); overflow:hidden; border:var(--border-std);">
                    <input type="text" id="cmd-palette-input" placeholder="Search for pages, items, projects..." style="width:100%; padding:20px; border:none; border-bottom:1px solid var(--color-border); font-size:1.2rem; outline:none; background:var(--color-bg-subtle); color:var(--color-text-base);">
                    <ul id="cmd-palette-results" style="list-style:none; margin:0; padding:0; max-height:400px; overflow-y:auto;">
                    </ul>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        this.modal = document.getElementById('cmd-palette-backdrop');
        this.input = document.getElementById('cmd-palette-input');
        this.resultsContainer = document.getElementById('cmd-palette-results');
    },

    bindEvents: function() {
        // Keyboard Shortcut Cmd+K or Ctrl+K
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.open();
            }
            if (e.key === 'Escape' && this.modal.style.display !== 'none') {
                this.close();
            }
        });

        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Input Filtering
        this.input.addEventListener('input', (e) => {
            this.renderResults(e.target.value);
        });
    },

    buildIndex: async function() {
        this.index = [];

        // 1. Static Pages
        this.index.push({ title: 'Home / Dashboard', type: 'Page', url: 'index.html' });
        this.index.push({ title: 'My Profile', type: 'Page', url: 'profile.html' });
        this.index.push({ title: 'My Economies', type: 'Page', url: 'independent.html' });
        this.index.push({ title: 'Sliding Scale Models', type: 'Page', url: 'independent_calibrations.html' });
        this.index.push({ title: 'Overhead Scenarios & Projects', type: 'Page', url: 'projects.html' });

        // Fetch User Data
        const profile = await Store.getIndependentProfile();
        
        if (profile) {
            // Expenses
            if (profile.expenses && profile.expenses.items) {
                profile.expenses.items.forEach(item => {
                    if (item.label) {
                        this.index.push({
                            title: item.label,
                            type: 'Expense',
                            subtitle: `$${item.amount} (${item.type})`,
                            url: `independent.html?open=expenses`
                        });
                    }
                });
            }

            // Income
            if (profile.unearnedIncome && profile.unearnedIncome.items) {
                profile.unearnedIncome.items.forEach(item => {
                    if (item.label) {
                        this.index.push({
                            title: item.label,
                            type: 'Non-Wage Income',
                            subtitle: `$${item.amount} (${item.type})`,
                            url: `independent.html?open=income`
                        });
                    }
                });
            }

            // Holdings
            if (profile.holdings && profile.holdings.items) {
                profile.holdings.items.forEach(item => {
                    if (item.label) {
                        this.index.push({
                            title: item.label,
                            type: 'Holdings / Assets',
                            subtitle: `$${item.amount}`,
                            url: `independent.html?open=holdings`
                        });
                    }
                });
            }

            // Lines of Work / Catalog Items
            if (profile.linesOfWork) {
                profile.linesOfWork.forEach((line, idx) => {
                    if (line.label) {
                        this.index.push({
                            title: line.label,
                            type: 'Catalog Item / Service',
                            subtitle: `Target: $${line.rate ? line.rate.toFixed(2) : 0}`,
                            url: `independent_calibrations.html?edit=${idx}`
                        });
                    }
                });
            }
        }

        // Projects
        const projects = await Store.getOverheadProjects();
        if (projects) {
            projects.forEach(proj => {
                this.index.push({
                    title: proj.name,
                    type: 'Business Profile / Project',
                    subtitle: proj.description || '',
                    url: `project.html?id=${proj.id}`
                });
            });
        }
    },

    open: function() {
        this.modal.style.display = 'flex';
        this.input.value = '';
        this.renderResults('');
        setTimeout(() => this.input.focus(), 50);
    },

    close: function() {
        this.modal.style.display = 'none';
    },

    renderResults: function(query) {
        this.resultsContainer.innerHTML = '';
        const q = query.toLowerCase().trim();

        let filtered = this.index;
        if (q !== '') {
            filtered = this.index.filter(item => 
                item.title.toLowerCase().includes(q) || 
                item.type.toLowerCase().includes(q) ||
                (item.subtitle && item.subtitle.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            this.resultsContainer.innerHTML = `<li style="padding:20px; text-align:center; color:var(--color-text-muted);">No results found.</li>`;
            return;
        }

        filtered.slice(0, 15).forEach(item => {
            const li = document.createElement('li');
            li.style.padding = '15px 20px';
            li.style.borderBottom = '1px solid var(--color-border)';
            li.style.cursor = 'pointer';
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';

            // Hover effect
            li.onmouseenter = () => li.style.background = 'var(--color-bg-subtle)';
            li.onmouseleave = () => li.style.background = 'transparent';

            li.innerHTML = `
                <div>
                    <div style="font-weight:bold; color:var(--color-text-base);">${item.title}</div>
                    ${item.subtitle ? `<div style="font-size:0.8rem; color:var(--color-text-muted); margin-top:4px;">${item.subtitle}</div>` : ''}
                </div>
                <div style="font-size:0.75rem; background:var(--color-bg-inverse); color:var(--color-text-inverse); padding:3px 8px; border-radius:12px;">
                    ${item.type}
                </div>
            `;

            li.onclick = () => {
                window.location.href = item.url;
            };

            this.resultsContainer.appendChild(li);
        });
    }
};

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    // Delay initialization slightly to ensure Store is ready
    setTimeout(() => {
        GlobalSearch.init();
    }, 500);
});
