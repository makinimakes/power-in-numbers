/**
 * Power in Numbers - Project Dashboard Logic
 * Handles detailed project view, phases, and rate calculations.
 */

// DEBUG: Confirm file loaded
// alert("Project.js Loaded"); 

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check (MUST be first for RLS)
    if (typeof Store === 'undefined') {
        alert("Store is undefined. Check js/store.js");
        return;
    }
    const currentUser = await Store.checkSession();
    if (!currentUser) {
        // Store.checkSession handles redirect, but just in case
        return;
    }
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) userDisplay.textContent = 'User: ' + currentUser;

    // 2. State & Init
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');

    if (!projectId) {
        window.location.href = 'projects.html';
        return;
    }

    // Async Fetch: Project
    let project = null;
    try {
        project = await Store.getProject(projectId);
    } catch (e) {
        alert("Error loading project: " + e.message + " (" + e.code + ")");
        window.location.href = 'projects.html';
        return;
    }

    if (!project) {
        alert('Project not found (or access denied). ID: ' + projectId);
        window.location.href = 'projects.html';
        return;
    }

    // Make project global for render functions
    window._project = project;
    // Helper accessor for legacy code if needed, but better to pass it or rely on window._project
    // We will update referencing code to use window._project or local variable if scope permits.
    // Actually, `render()` relies on `project`. We need to make sure `project` var is accessible.
    // In this file, `project` was top-level scope or module scope?
    // It was execution scope inside listener. `render()` calls `project`.
    // Wait, `render()` is defined globally? No, it's inside the listener? 
    // Let's check the file structure.

    // ... Checked: render() is likely defined inside or outside. 
    // In original code, `let project = Store.getProject` was inside the listener. 
    // `render()` closes over it? 
    // If `render` is defined OUTSIDE, it won't see `project`.
    // Let's assume `render` is INSIDE the listener OR uses a global.
    // Looking at previous `view_file` (Step 11), `render()` accesses `project`.
    // If I keep `project` inside the `async () =>`, `render` must be inside too.

    // Async Fetch: Users (for collaboration names)
    const memberEmails = project.teamMembers ? project.teamMembers.map(m => m.email || m.username) : [];
    if (project.owner) memberEmails.push(project.owner);

    let usersMap = {};
    try {
        if (Store.getUsersMap) {
            usersMap = await Store.getUsersMap(memberEmails);
        } else {
            console.warn("Store.getUsersMap missing, skipping user details.");
        }
    } catch (err) {
        console.error("Error fetching user map:", err);
    }

    // Wizard Logic
    const Wizard = {
        state: {},

        reset: (phaseId) => {
            Wizard.state = { phaseId: phaseId, type: null, subType: null };
            // Reset UI
            document.querySelectorAll('[id^="wizard-step-"]').forEach(el => el.style.display = 'none');
            document.getElementById('wizard-step-1').style.display = 'block';
            document.getElementById('btn-wizard-finish').style.display = 'none';
            // Reset Inputs
            document.querySelectorAll('#modal-line-item-wizard input').forEach(i => i.value = '');
            document.getElementById('wiz-time-count').value = 1;
        },

        setType: (type) => {
            Wizard.state.type = type;
            document.getElementById('wizard-step-1').style.display = 'none';
            if (type === 'Percentage') {
                document.getElementById('wizard-step-percent').style.display = 'block';
                Wizard.showFinish();
            } else {
                document.getElementById('wizard-step-flat-type').style.display = 'block';
            }
        },

        setTimeBased: (isTime) => {
            Wizard.state.isTime = isTime;
            document.getElementById('wizard-step-flat-type').style.display = 'none';
            if (isTime) {
                document.getElementById('wizard-step-time').style.display = 'block';
                Wizard.showFinish();
            } else {
                document.getElementById('wizard-step-fixed-struct').style.display = 'block';
            }
        },

        setFixedType: (fixedType) => {
            Wizard.state.fixedType = fixedType;
            document.getElementById('wizard-step-fixed-struct').style.display = 'none';
            if (fixedType === 'Lump') {
                document.getElementById('wizard-step-lump').style.display = 'block';
            } else {
                document.getElementById('wizard-step-unit').style.display = 'block';
            }
            Wizard.showFinish();
        },

        showFinish: () => {
            document.getElementById('btn-wizard-finish').style.display = 'block';
        },

        finish: () => {
            const name = document.getElementById('wiz-name').value;
            if (!name) return alert('Name is required');

            const s = Wizard.state;
            let item = {
                id: crypto.randomUUID(),
                name: name,
                itemType: s.type // 'Percentage' or 'Flat'
            };

            if (s.type === 'Percentage') {
                item.percentage = parseFloat(document.getElementById('wiz-percent').value);
            } else {
                // Flat
                if (s.isTime) {
                    item.method = 'Time';
                    item.count = parseFloat(document.getElementById('wiz-time-count').value);
                    item.duration = parseFloat(document.getElementById('wiz-time-duration').value);
                    item.unit = document.getElementById('wiz-time-unit').value;
                    item.rate = parseFloat(document.getElementById('wiz-time-rate').value);
                } else {
                    if (s.fixedType === 'Lump') {
                        item.method = 'LumpSum';
                        item.amount = parseFloat(document.getElementById('wiz-lump-amount').value);
                    } else {
                        item.method = 'Unit';
                        item.count = parseFloat(document.getElementById('wiz-unit-qty').value);
                        item.rate = parseFloat(document.getElementById('wiz-unit-cost').value); // Cost per item
                    }
                }
            }

            // Save
            const phase = project.phases.find(p => p.id === s.phaseId);
            if (phase) {
                if (!phase.lineItems) phase.lineItems = [];
                phase.lineItems.push(item);
                Store.saveProject(project);
                render();
            }
            document.getElementById('modal-line-item-wizard').style.display = 'none';
        }
    };
    window.Wizard = Wizard;

    // 1. Elements (Dynamic lookups within render/events)
    const getElements = () => ({
        summary: {
            ideal: {
                total: document.getElementById('dash-ideal-total'),
                gross: document.getElementById('dash-ideal-gross'),
                net: document.getElementById('dash-ideal-net')
            },
            possible: {
                total: document.getElementById('dash-possible-total'),
                gross: document.getElementById('dash-possible-gross'),
                net: document.getElementById('dash-possible-net')
            },
            confirmed: {
                total: document.getElementById('dash-confirmed-total'),
                gross: document.getElementById('dash-confirmed-gross'),
                net: document.getElementById('dash-confirmed-net')
            }
        },
        pool: {
            minWage: document.getElementById('pool-min-wage'),
            maxWage: document.getElementById('pool-max-wage'),
            list: document.getElementById('team-pool-list')
        },
        phases: {
            container: document.getElementById('phases-container')
        }
    });

    // Helper: View Math
    window.viewMathLog = (memberId) => {
        const entry = window._projectLedger[memberId];
        const modal = document.getElementById('modal-math-log');
        const title = document.getElementById('math-log-title');
        const content = document.getElementById('math-log-content');

        if (!modal || !title || !content) {
            console.error("Math Log Modal elements not found");
            return;
        }

        if (!entry) {
            title.textContent = 'Detail';
            content.innerHTML = '<p>No data found.</p>';
            modal.style.display = 'flex';
            return;
        }

        title.textContent = entry.name;
        content.innerHTML = '';

        if (!entry.mathLog || entry.mathLog.length === 0) {
            content.innerHTML = '<p style="color:gray; font-style:italic;">No equity accumulated yet.</p>';
        } else {
            entry.mathLog.forEach(log => {
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.style.borderBottom = '1px solid #eee';
                div.style.paddingBottom = '10px';
                div.innerHTML = `
                    <div style="font-size:0.9rem; color:#555; margin-bottom:4px;">${log.formula}</div>
                    <div style="font-weight:bold; color:var(--color-primary); text-align:right;">= ${Utils.formatCurrency(log.value)}</div>
                `;
                content.appendChild(div);
            });

            const totalDiv = document.createElement('div');
            totalDiv.style.marginTop = '15px';
            totalDiv.style.textAlign = 'right';
            totalDiv.style.fontSize = '1.1rem';
            totalDiv.innerHTML = `Total Equity: <strong>${Utils.formatCurrency(entry.equity)}</strong>`;
            content.appendChild(totalDiv);
        }

        modal.style.display = 'flex';
    };

    function renderShares() {
        const pie = document.getElementById('shares-pie-chart');
        const legend = document.getElementById('shares-legend');
        const tbody = document.getElementById('shares-table-body');
        const totalEl = document.getElementById('shares-total-equity');

        if (!pie || !tbody) return;

        tbody.innerHTML = '';
        legend.innerHTML = '';

        let totalEquity = 0;
        const entries = window._projectLedger ? Object.values(window._projectLedger) : [];

        // Sort by Equity Descending
        entries.sort((a, b) => b.equity - a.equity);

        entries.forEach(e => totalEquity += e.equity);

        totalEl.textContent = Utils.formatCurrency(totalEquity);

        let conicGradient = [];
        let currentDeg = 0;
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#8AC926', '#1982C4'];

        entries.forEach((e, index) => {
            // Find ID from ledger if not stored in entry (entry IS the value)
            // We need the key (ID) but we flattened to array.
            // Oh, entry does not have ID inside it currently in `calculateProjectTotal`.
            // I need to add ID to the ledger value object.

            const share = totalEquity > 0 ? (e.equity / totalEquity) : 0;
            const pct = (share * 100).toFixed(1);
            const color = colors[index % colors.length];

            // Table Row
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <span style="display:inline-block; width:10px; height:10px; background:${color}; margin-right:5px; border-radius:50%;"></span>
                    ${e.name}
                </td>
                <td>Collaborator</td> <!-- Dynamic role? -->
                <td>
                    ${Utils.formatCurrency(e.equity)}
                    <button onclick="window.viewMathLog('${e.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem; opacity:0.6;" title="See Calculations">ℹ️</button>
                </td>
                <td style="font-weight:bold;">${pct}%</td>
            `;
            tbody.appendChild(tr);

            // Chart Segment
            const deg = share * 360;
            // CSS conic-gradient syntax: color startDeg endDeg
            // We must track cumulative start/end
            // But we do that in the second loop. This loop here defines colors.
            // Actually the conicGradient usage below is wrong (it pushes strings but doesn't track relative/absolute correctly in first loop).
            // The second loop handles it.
        });

        // Re-loop for correct gradient Syntax
        let gradientStr = '';
        let degCursor = 0;
        entries.forEach((e, index) => {
            const share = totalEquity > 0 ? (e.equity / totalEquity) : 0;
            const deg = share * 360;
            const color = colors[index % colors.length];
            const start = degCursor;
            const end = degCursor + deg;
            gradientStr += `${color} ${start}deg ${end}deg, `;
            degCursor = end;

            // Legend
            const pct = (share * 100).toFixed(1);
            const item = document.createElement('div');
            item.style.marginBottom = '5px';
            item.innerHTML = `<span style="color:${color}; font-weight:bold;">● ${pct}%</span> ${e.name}`;
            legend.appendChild(item);
        });

        // Remove trailing comma
        if (gradientStr.length > 2) gradientStr = gradientStr.slice(0, -2);

        if (totalEquity === 0) {
            pie.style.background = '#eee';
        } else {
            pie.style.background = `conic-gradient(${gradientStr})`;
        }
    }

    // Set Title
    document.getElementById('project-title').textContent = project.name || 'Untitled Project';

    // 3. Render Functions
    // Main Render Loop
    function render() {
        if (!project) return;

        // Render Title
        document.getElementById('project-title').textContent = project.name;

        // 1. Phases (Calc cost, populates _projectLedger via calculateProjectTotal implicit/explicit?)
        // Wait, calculateProjectTotal() runs the logic to populate _projectLedger.
        // renderSummary calls calculateProjectTotal.
        // renderPhases does not populate ledger, it reads from project data but the ledger is global?
        // Actually, calculateProjectTotal RE-RUNS the whole calc traversal.

        // So we must call calculateProjectTotal FIRST to populate global state before rendering shares.
        calculateProjectTotal();

        renderPool();
        renderPhases();
        renderSummary(); // Updates Scenarios
        renderShares(); // NEW
    }

    function renderGlobalRates() {
        document.getElementById('project-global-pay-rate').value = project.payRate || 100;
        document.getElementById('project-global-expense-rate').value = project.expenseRate || 100;
    }


    // New Helper to sum up ALL costs for the Summary and Calculate Equity Shares
    function calculateProjectTotal() {
        let total = 0;

        // Reset Ledger for Equity Calculation
        const ledger = {}; // { memberId: { name, cash: 0, equity: 0, totalValue: 0, mathLog: [] } }
        project.teamMembers.forEach(m => {
            // Use local usersMap instead of deprecated Store.getUsers()
            const user = usersMap[m.username] || (Store.getUsers ? Store.getUsers()[m.username] : {}) || {};
            const profile = user.independentProfile || {}; // Handle missing profile
            const rates = BudgetEngine.getWorkerRates(profile); // Full precision
            ledger[m.id] = {
                id: m.id,
                name: m.name,
                cash: 0,
                equity: 0,
                goalRate: rates.goal,
                mathLog: [] // Store derivation steps
            };
        });

        // Loop Phases
        project.phases.forEach(phase => {
            // Skip Inactive Phases
            if (phase.isActive === false) return;

            // 1. Labor
            let laborTotal = 0;
            project.teamMembers.forEach(member => {
                const workerState = (phase.workers && phase.workers[member.id]) || { isPresent: false };
                if (workerState.isPresent) {
                    const costData = calculateWorkerCost(member, phase, workerState);
                    laborTotal += costData.total;

                    // Update Ledger
                    if (ledger[member.id]) {
                        ledger[member.id].cash += costData.total;

                        // Equity Calc
                        const eqCalc = BudgetEngine.calculateEquity(ledger[member.id].goalRate, costData.rate, costData.hours);
                        ledger[member.id].equity += eqCalc.value;

                        // Capture Math Log
                        if (eqCalc.value > 0) {
                            ledger[member.id].mathLog.push({
                                phase: phase.name,
                                formula: `Phase: ${phase.name}<br>(${Utils.formatNumber(ledger[member.id].goalRate)} [Goal] - ${Utils.formatNumber(costData.rate)} [Pay]) * ${Utils.formatNumber(costData.hours)} hrs`,
                                value: eqCalc.value
                            });
                        }
                    }
                }
            });

            // 2. Expenses (Line Items)
            // Resolve Expense Rate
            let expRateVal = 100;
            if (phase.expenseRate !== null && phase.expenseRate !== undefined && phase.expenseRate !== "") {
                expRateVal = parseFloat(phase.expenseRate);
            } else {
                expRateVal = parseFloat(project.expenseRate) || 100;
            }
            const expFactor = expRateVal / 100;

            let flatTotal = 0;
            const flats = (phase.lineItems || []).filter(i => i.itemType !== 'Percentage');
            const percents = (phase.lineItems || []).filter(i => i.itemType === 'Percentage');

            flats.forEach(i => {
                const raw = calculateItemCost(i);
                flatTotal += (raw.cost * expFactor);
            });

            const subTotal = flatTotal + laborTotal;

            // 3. Percentage Calculations (Gross Up)
            let totalPct = 0;
            percents.forEach(i => totalPct += (parseFloat(i.percentage) || 0));

            // Safety Cap
            if (totalPct > 99) totalPct = 99;

            const grossTotal = subTotal / (1 - (totalPct / 100)); // The theoretical Total

            let percentTotal = 0;
            percents.forEach(i => {
                // Cost is % of the GROSS Total
                const amount = grossTotal * (i.percentage / 100);
                percentTotal += amount;
            });

            total += (subTotal + percentTotal);
        });

        // Store Ledger globally for rendering
        window._projectLedger = ledger;

        return total;
    }

    // Helper: Calculate Scenario Distribution (Waterfall)
    function calculateDistribution(incomeTotal, cashCosts, liabilityTotal) {
        let distributable = incomeTotal - cashCosts;

        // Logic: Payout is capped at LiabilityTotal.
        // If Distributable < 0, Payout = 0.
        // If Distributable < Liability, Payout = Distributable.
        // If Distributable > Liability, Payout = Liability.
        // (Remainder is Net Profit / pure profit)

        let payout = 0;
        if (distributable > 0) {
            if (distributable >= liabilityTotal) {
                payout = liabilityTotal;
            } else {
                payout = distributable;
            }
        } else {
            // Deficit
            distributable = 0;
        }

        const netProfit = (incomeTotal - cashCosts) - payout;

        return {
            grossProfit: (incomeTotal - cashCosts),
            distributable: Math.max(0, incomeTotal - cashCosts),
            payout: payout,
            netProfit: netProfit
        };
    }

    function updateScenarioCard(el, funding, cost, liability) {
        if (!el.total) return;

        // Legacy Display (Deficit check)
        el.total.textContent = Utils.formatCurrency(funding);

        // New Detailed Display
        const dist = calculateDistribution(funding, cost, liability);

        if (el.gross) el.gross.textContent = Utils.formatCurrency(dist.grossProfit);

        if (el.net) {
            el.net.textContent = Utils.formatCurrency(dist.netProfit);
            if (dist.netProfit >= 0) {
                el.net.style.color = 'var(--color-primary)';
            } else {
                el.net.style.color = 'red';
            }
        }
    }

    function renderSummary() {
        const els = getElements();

        // Dynamic Cost Calculation
        const totalCost = calculateProjectTotal(); // Populates window._projectLedger

        // Calculate Total Liability from Ledger
        let totalLiability = 0;
        if (window._projectLedger) {
            Object.values(window._projectLedger).forEach(e => totalLiability += e.equity);
        }

        // Income Aggregates
        const income = project.incomeSources || [];
        const sumConfirmed = income.filter(i => i.status === 'Confirmed').reduce((s, i) => s + i.amount, 0);
        const sumLikely = income.filter(i => i.status === 'Likely').reduce((s, i) => s + i.amount, 0);
        const sumUnconfirmed = income.filter(i => i.status === 'Unconfirmed').reduce((s, i) => s + i.amount, 0);

        const possibleTotal = sumConfirmed + sumLikely;
        const idealTotal = sumConfirmed + sumLikely + sumUnconfirmed;

        // Render Cards
        updateScenarioCard(els.summary.confirmed, sumConfirmed, totalCost, totalLiability);
        updateScenarioCard(els.summary.possible, possibleTotal, totalCost, totalLiability);
        updateScenarioCard(els.summary.ideal, idealTotal, totalCost, totalLiability);

        // Render Funding List
        const fundingList = document.getElementById('funding-list');
        if (fundingList) {
            fundingList.innerHTML = '';
            project.incomeSources.forEach(source => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${source.name}</td>
                    <td><span class="status-badge status-${source.status.toLowerCase()}">${source.status}</span></td>
                    <td>${Utils.formatCurrency(source.amount)}</td>
                    <td>
                        <button class="btn-edit-funding" data-id="${source.id}" style="color:var(--color-primary); background:none; border:none; cursor:pointer; margin-right:10px;">✎</button>
                        <button class="btn-delete-funding" data-id="${source.id}" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
                    </td>
                `;
                fundingList.appendChild(tr);
            });
        }
    }

    // Helper: Delete Funding (Global delegated now)
    // removed window.removeFunding ...

    function renderPool() {
        const els = getElements();

        // Get Modifiers (default 100 if new)
        const minMod = parseFloat(project.minModifier) || 100;
        const maxMod = parseFloat(project.maxModifier) || 100;

        // Calculate Min/Max Rates with modifiers
        const params = BudgetEngine.calculateProjectParams(project.teamMembers, usersMap, minMod, maxMod);

        // Update UI Stats
        els.pool.minWage.textContent = Utils.formatCurrency(params.projectMinWage) + '/hr';
        els.pool.maxWage.textContent = Utils.formatCurrency(params.projectMaxWage) + '/hr';

        // Update UI Inputs (avoid overwriting if focused? Simple render re-sets values)
        const inputMin = document.getElementById('project-min-mod');
        const inputMax = document.getElementById('project-max-mod');

        if (document.activeElement !== inputMin) inputMin.value = minMod;
        if (document.activeElement !== inputMax) inputMax.value = maxMod;

        els.pool.list.innerHTML = '';
        project.teamMembers.forEach(member => {
            const user = usersMap[member.username];
            const profile = user ? user.independentProfile : null;
            const rates = BudgetEngine.getWorkerRates(profile);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight:bold;">${member.name}</div>
                    <div style="font-size:0.8rem; color:gray;">${member.email || ''}</div>
                </td>
                <td>${member.username || 'Invited'}</td>
                <td>
                    <div style="display:flex; gap:10px;">
                        <span style="color:var(--color-text-muted);">Now: <strong>${Utils.formatCurrency(rates.now)}/hr</strong></span>
                        <span style="color:var(--color-primary);">Goal: <strong>${Utils.formatCurrency(rates.goal)}/hr</strong></span>
                    </div>
                </td>
                <td>
                    <button class="btn-remove-pool" data-id="${member.id}" style="color:red; border:none; background:none; cursor:pointer; font-size:1.2rem;">&times;</button>
                </td>
            `;
            els.pool.list.appendChild(tr);
        });
    }

    function renderPhases() {
        const els = getElements();
        els.phases.container.innerHTML = '';
        project.phases.forEach((phase, index) => {

            // --- 1. Labor Calculations ---
            phase.labor = phase.labor || {}; // Store results
            let laborTotal = 0;
            const activeWorkers = [];

            // Ensure all team members have an entry in phase logic
            project.teamMembers.forEach(member => {
                // Default state if not present
                const workerState = (phase.workers && phase.workers[member.id]) || { isPresent: false };

                if (workerState.isPresent) {
                    const costData = calculateWorkerCost(member, phase, workerState);
                    activeWorkers.push({ member, state: workerState, cost: costData });
                    laborTotal += costData.total;
                }
            });


            // --- 2. Expense Calculations (Line Items) ---

            // Resolve Expense Rate Factor
            let expRateVal = 100;
            if (phase.expenseRate !== null && phase.expenseRate !== undefined && phase.expenseRate !== "") {
                expRateVal = parseFloat(phase.expenseRate);
            } else {
                expRateVal = parseFloat(project.expenseRate) || 100;
            }
            const expFactor = expRateVal / 100;

            let flatTotal = 0;
            const flats = (phase.lineItems || []).filter(i => i.itemType !== 'Percentage');
            const percents = (phase.lineItems || []).filter(i => i.itemType === 'Percentage');

            flats.forEach(i => {
                const raw = calculateItemCost(i);
                // Apply Factor
                i._calc = {
                    cost: raw.cost * expFactor,
                    desc: raw.desc + (expFactor !== 1 ? ` <span style="color:blue">(@${expRateVal}%)</span>` : '')
                };
                flatTotal += i._calc.cost;
            });

            // Calc Percents (based on flatTotal + laborTotal ? Usually % is on Phase Total... 
            // The requirement says "percentage of the total phase expenses". 
            // Usually this includes Labor? Let's assume Yes for "Total Phase Cost".
            // However, typical line items might depend on sub-totals. 
            // For now, let's treat "Percentage" items as % of (Labor + Other Expenses).

            const subTotal = flatTotal + laborTotal;

            // 3. Percentage Calculations (Gross Up)
            // Requirement: "10% of Total Phase Expenses" implies the Fee is included in the Total.
            // Formula: Total = SubTotal / (1 - TotalPercentageRate)

            // percents is already defined above
            let totalPct = 0;
            percents.forEach(i => totalPct += (parseFloat(i.percentage) || 0));

            // Safety Cap: Don't allow 100% or more (infinite cost)
            if (totalPct > 99) totalPct = 99;

            const grossTotal = subTotal / (1 - (totalPct / 100)); // The theoretical Total

            let percentTotal = 0;
            percents.forEach(i => {
                // Cost is % of the GROSS Total
                const amount = grossTotal * (i.percentage / 100);
                i._calc = { cost: amount, desc: `${i.percentage}% of Phase Total` };
                percentTotal += amount;
            });

            const phaseTotal = subTotal + percentTotal;
            const weeks = parseFloat(phase.weeks) || 0;
            const hoursPerWeek = parseFloat(phase.hours) || 0;
            const weeklyCost = weeks > 0 ? phaseTotal / weeks : 0;

            // Hourly Calc
            const totalHours = weeks * hoursPerWeek;
            const hourlyCost = totalHours > 0 ? phaseTotal / totalHours : 0;

            // --- Render ---
            const div = document.createElement('div');
            div.className = 'summary-card';
            div.style.marginBottom = '20px';
            if (phase.isActive === false) {
                div.style.opacity = '0.5';
                div.style.borderLeft = '4px solid #ccc';
            } else {
                div.style.borderLeft = '4px solid var(--color-primary)';
            }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #eee; padding-bottom:15px; margin-bottom:15px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <h2 style="margin:0;">${phase.name}</h2>
                            <!-- Active Toggle -->
                            <label class="switch" style="font-size:0.8rem; display:flex; align-items:center; gap:5px; cursor:pointer;">
                                <input type="checkbox" class="cb-phase-active" data-phase="${phase.id}" ${phase.isActive !== false ? 'checked' : ''}>
                                <span>${phase.isActive !== false ? 'Active' : 'Inactive'}</span>
                            </label>
                            <button class="btn-phase-settings" data-phase="${phase.id}" style="font-size:0.8rem;">⚙️ Settings</button>
                        </div>
                        <div style="margin-top:5px; color:#666; font-size:0.9rem;">
                            ${phase.weeks || 0} wks @ ${phase.hours || 0} hrs/wk 
                            | Pay Rate: ${phase.payRate || 'Default'}% 
                            | Exp Rate: ${phase.expenseRate || 'Default'}%
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.2rem; font-weight:bold; color:var(--color-primary);">${Utils.formatCurrency(phaseTotal)}</div>
                        <div style="font-size:0.8rem; color:#666;">
                            ${Utils.formatCurrency(weeklyCost)} / week &bull; ${Utils.formatCurrency(hourlyCost)} / hr
                        </div>
                    </div>
                </div>

                <!-- LABOR SECTION -->
                <div style="margin-bottom:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <h4 style="margin:0;">Worker Wages</h4>
                        <div style="font-size:0.8rem; color:#666;">
                            Total: <strong>${Utils.formatCurrency(laborTotal)}</strong>
                        </div>
                    </div>
                    ${renderLaborTable(phase, project.teamMembers)}
                </div>
                
                <!-- EXPENSES SECTION -->
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <h4 style="margin:0;">Expenses</h4>
                        <button class="btn-add-line" data-phase="${phase.id}" style="font-size:0.8rem;">+ Add Expense</button>
                    </div>
                    <table class="ledger-table" style="font-size:0.9rem;">
                        <tbody>
                            ${renderLineItems(phase)}
                        </tbody>
                    </table>
                     <div style="text-align:right; margin-top:5px; font-weight:bold; font-size:0.9rem;">
                         Expenses Total: ${Utils.formatCurrency(flatTotal + percentTotal)}
                     </div>
                </div>
                
                <div style="text-align:right; margin-top:20px; border-top:1px solid #eee; padding-top:10px;">
                     <button class="btn-delete-phase" data-phase="${phase.id}" style="color:red; background:none; border:none; cursor:pointer;">Delete Phase</button>
                </div>
            `;
            els.phases.container.appendChild(div);
        });
    }

    // Helper: Labor Calculation Logic
    function calculateWorkerCost(member, phase, state) {
        // 1. Get Base Rates
        const user = Store.getUsers()[member.username] || {};
        const profile = user.independentProfile;
        const baseRates = BudgetEngine.getWorkerRates(profile); // { now, goal }

        // 2. Determine Hourly Rate
        let appliedRate = 0;

        // Get Modifiers
        const minMod = parseFloat(project.minModifier) || 100;
        const maxMod = parseFloat(project.maxModifier) || 100;

        const projectParams = BudgetEngine.calculateProjectParams(project.teamMembers, Store.getUsers(), minMod, maxMod);

        if (state.overrideRateMethod === 'custom') {
            appliedRate = parseFloat(state.overrideRateVal) || 0;
        } else if (state.overrideRateMethod === 'min') {
            appliedRate = projectParams.projectMinWage;
        } else if (state.overrideRateMethod === 'max') {
            appliedRate = projectParams.projectMaxWage;
        } else {
            // Auto: Goal * Pay Rate
            // Cap at Goal (unless override? Request says "no worker... higher than GOAL unless override")
            // Floor at MinWage

            // Priority: Phase Override -> Project Global -> Default (100)
            let payFactorVal = 100;
            if (phase.payRate !== null && phase.payRate !== undefined && phase.payRate !== "") {
                payFactorVal = parseFloat(phase.payRate);
            } else {
                payFactorVal = parseFloat(project.payRate) || 100;
            }

            const payFactor = payFactorVal / 100;

            let calc = baseRates.goal * payFactor;

            // Floor / Ceiling
            calc = Math.max(calc, projectParams.projectMinWage);

            // Cap at Project Max Wage (if valid positive number)
            if (projectParams.projectMaxWage > 0) {
                calc = Math.min(calc, projectParams.projectMaxWage);
            }

            // Also never exceed their own Goal (redundant if Max Wage < Goal, but safe)
            calc = Math.min(calc, baseRates.goal);

            appliedRate = calc;
        }

        // 3. Determine Hours
        let totalHours = 0;
        let scheduleDesc = "";

        if (state.overrideSchedMethod === 'lump') {
            totalHours = parseFloat(state.overrideSchedLumpVal) || 0;
            scheduleDesc = `${totalHours} hrs (Lump)`;
        } else if (state.overrideSchedMethod === 'custom-weekly') {
            const wks = parseFloat(phase.weeks) || 0;
            const hrs = parseFloat(state.overrideSchedWeeklyVal) || 0;
            totalHours = wks * hrs;
            scheduleDesc = `${hrs} hrs/wk`;
        } else if (state.overrideSchedMethod === 'project') {
            // Conform to Project Schedule (Full Hours, Ignore Capacity)
            const phaseWks = parseFloat(phase.weeks) || 0;
            const phaseHrs = parseFloat(phase.hours) || 0;
            totalHours = phaseWks * phaseHrs;
            scheduleDesc = `${phaseWks} wks @ ${phaseHrs} hrs/wk (Project)`;
        } else {
            // Auto: "Stated amount of phase hours OR max amount... considering billable time"
            const phaseWks = parseFloat(phase.weeks) || 0;
            const phaseHrs = parseFloat(phase.hours) || 0;

            // Capacity Check
            // Simulating capacity check: Profile -> Schedule -> Total Annual Hours / 52? 
            // "weekly billable time established from their ... profile"
            const profileWs = parseFloat(profile?.schedule?.weeks) || 0;
            const profileHs = parseFloat(profile?.schedule?.hours) || 0;
            const profileDs = parseFloat(profile?.schedule?.days) || 0;

            // Annual hours = W * D * H. Weekly capacity = (W*D*H)/52 ? Or just D*H if they work every week? 
            // Let's assume implicit weekly capacity = Days * Hours (from profile).
            const rawWeekly = (profileDs * profileHs) || 168;

            // Apply Billable Ratio
            const capData = Utils.calculateBillableCapacity(profile);
            const ratio = capData.billableRatio || 1.0;

            const weeklyCap = Math.floor(rawWeekly * ratio); // Round DOWN to whole number

            const actualHrs = Math.min(phaseHrs, weeklyCap);
            totalHours = phaseWks * actualHrs;
            scheduleDesc = `${phaseWks} wks @ ${actualHrs} hrs/wk`;
        }

        return {
            rate: appliedRate,
            hours: totalHours,
            total: appliedRate * totalHours,
            desc: scheduleDesc
        };
    }

    function renderLaborTable(phase, members) {
        // Determine if all are selected
        const allSelected = members.length > 0 && members.every(m => {
            const s = (phase.workers && phase.workers[m.id]);
            return s && s.isPresent;
        });

        let html = `<table class="ledger-table" style="font-size:0.85rem; background:#fff; margin-bottom:10px;">
            <thead>
                <tr style="background:#f5f5f5;">
                    <th style="width:30px;"><input type="checkbox" class="cb-toggle-all-labor" data-phase="${phase.id}" ${allSelected ? 'checked' : ''}></th>
                    <th>Worker</th>
                    <th>Rate ($/hr)</th>
                    <th>Schedule</th>
                    <th style="text-align:right;">Total</th>
                </tr>
            </thead>
            <tbody>`;

        members.forEach(m => {
            const state = (phase.workers && phase.workers[m.id]) || { isPresent: false };

            // Visual State: Active vs Inactive
            let rowStyle = state.isPresent
                ? 'background-color: #f0f7ff; color: #000; font-weight:500;'
                : 'background-color: #fff; color: #666;';

            let calc = { rate: 0, hours: 0, total: 0, desc: '-' };
            if (state.isPresent) {
                calc = calculateWorkerCost(m, phase, state);
            }

            html += `
                <tr style="${rowStyle}">
                    <td><input type="checkbox" class="cb-worker-present" data-phase="${phase.id}" data-worker="${m.id}" ${state.isPresent ? 'checked' : ''}></td>
                    <td>${m.name}</td>
                    <td>
                        ${state.isPresent ?
                    `<button class="btn-worker-override" data-phase="${phase.id}" data-worker="${m.id}" data-mode="rate"
                      style="border:1px solid var(--color-primary); border-radius:4px; background:#fff; color:var(--color-primary); cursor:pointer; padding:2px 6px; font-weight:bold;">
                      ${Utils.formatCurrency(calc.rate)}/hr
                    </button>`
                    : '-'}
                    </td>
                    <td>
                        ${state.isPresent ?
                    `<button class="btn-worker-override" data-phase="${phase.id}" data-worker="${m.id}" data-mode="schedule"
                      style="border:none; background:none; color:#000; text-decoration:underline; cursor:pointer; font-size:0.85rem; padding:0;">
                      ${calc.desc}
                    </button>`
                    : '-'}
                    </td>
                    <td style="text-align:right;">${state.isPresent ? Utils.formatCurrency(calc.total) : '-'}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    function calculateItemCost(item) {
        if (item.itemType === 'Percentage') return { cost: 0, desc: '' }; // handled above

        if (item.method === 'LumpSum') {
            return { cost: item.amount || 0, desc: 'Flat Sum' };
        }
        if (item.method === 'Unit') {
            const cost = (item.count || 0) * (item.rate || 0);
            return { cost: cost, desc: `${item.count} items x ${Utils.formatCurrency(item.rate)}` };
        }
        if (item.method === 'Time') {
            const cost = (item.count || 1) * (item.duration || 0) * (item.rate || 0);
            return { cost: cost, desc: `${item.count} people x ${item.duration} ${item.unit} @ ${Utils.formatCurrency(item.rate)}/${item.unit.slice(0, -1)}` };
        }
        // Fallback for old items
        if (item.rate && item.units) {
            return { cost: item.rate * item.units, desc: `${item.units} units @ ${Utils.formatCurrency(item.rate)}` };
        }
        return { cost: 0, desc: 'Invalid Data' };
    }

    function renderLineItems(phase) {
        if (!phase.lineItems || phase.lineItems.length === 0) {
            return `<tr><td colspan="4" style="text-align:center; color:gray; font-style:italic;">No line items yet.</td></tr>`;
        }
        return phase.lineItems.map(item => `
            <tr>
                <td>${item.name}</td>
                <td><span style="color:#666;">${item._calc.desc}</span></td>
                <td style="text-align:right; font-weight:bold;">${Utils.formatCurrency(item._calc.cost)}</td>
                <td><button class="btn-remove-line" data-phase="${phase.id}" data-item="${item.id}" style="color:red; background:none; border:none; cursor:pointer;">&times;</button></td>
            </tr>
        `).join('');
    }

    // 4. Global Event Delegation (Robust Handling)
    document.addEventListener('click', async (e) => {
        // console.log("Global Click:", e.target); // DEBUG
        const btn = e.target.closest('button');
        if (!btn) return; // Only care about buttons

        // Button: Add Member (Open Modal)
        if (btn.id === 'btn-add-member') {
            window.resetModal();
            document.getElementById('modal-add-member').style.display = 'flex';
        }

        // Button: Add Phase
        if (btn.id === 'btn-add-phase') {
            document.getElementById('new-phase-name').value = '';
            document.getElementById('modal-add-phase').style.display = 'flex';
            document.getElementById('new-phase-name').focus();
            // Legacy direct binding moved to separate handler or global save
        }

        // Button: Rename Phase
        if (btn.classList.contains('btn-edit-phase')) {
            const id = btn.dataset.phase;
            const phase = project.phases.find(p => p.id === id);
            if (phase) {
                const newName = prompt("Enter new phase name:", phase.name);
                if (newName && newName.trim() !== "") {
                    phase.name = newName.trim();
                    Store.saveProject(project);
                    render();
                }
            }
        }

        // Button: Remove Pool Member
        if (btn.classList.contains('btn-remove-pool')) {
            const id = btn.dataset.id;
            if (confirm('Remove this collaborator from the project?')) {
                project.teamMembers = project.teamMembers.filter(m => m.id !== id);
                Store.saveProject(project);
                render();
            }
        }

        // Button: Add Funding (Open Modal - Clean)
        if (btn.id === 'btn-open-income-modal') {
            document.getElementById('income-id').value = '';
            document.getElementById('income-name').value = '';
            document.getElementById('income-amount').value = '';
            document.getElementById('modal-add-income').style.display = 'flex';
        }

        // Button: Edit Funding (Open Modal - Populate)
        if (btn.classList.contains('btn-edit-funding')) {
            const id = btn.dataset.id;
            const proj = window._project || project; // Fallback
            const source = proj.incomeSources.find(s => s.id === id);
            if (source) {
                document.getElementById('income-id').value = source.id;
                document.getElementById('income-name').value = source.name;
                document.getElementById('income-amount').value = source.amount;
                document.getElementById('income-status').value = source.status;
                document.getElementById('modal-add-income').style.display = 'flex';
            }
        }

        // Button: Add Line Item
        if (btn.classList.contains('btn-add-line')) {
            const phaseId = btn.dataset.phase;
            // Open Wizard
            document.getElementById('modal-line-item-wizard').style.display = 'flex';
            Wizard.reset(phaseId);
        }

        // Button: Wizard Finish
        if (btn.id === 'btn-wizard-finish') {
            Wizard.finish();
        }

        // Button: Remove Line Item
        if (btn.classList.contains('btn-remove-line')) {
            const pId = btn.dataset.phase;
            const iId = btn.dataset.item;
            if (confirm('Remove this line item?')) {
                const phase = project.phases.find(p => p.id === pId);
                if (phase) {
                    phase.lineItems = phase.lineItems.filter(i => i.id !== iId);
                    Store.saveProject(project);
                    render();
                }
            }
        }

        // Button: Delete Phase
        if (btn.classList.contains('btn-delete-phase')) {
            const id = btn.dataset.phase;
            if (confirm('Delete this phase?')) {
                project.phases = project.phases.filter(p => p.id !== id);
                Store.saveProject(project);
                render();
            }
        }

        // Button: Remove Funding
        if (btn.classList.contains('btn-delete-funding')) {
            const id = btn.dataset.id;
            if (confirm('Delete this funding source?')) {
                project.incomeSources = project.incomeSources.filter(i => i.id !== id);
                Store.saveProject(project);
                render();
            }
        }



        // Button: Phase Settings
        // Button: Save Funding / Income
        if (btn.id === 'btn-save-income') {
            console.log("Debug: Save Source Clicked");

            const id = document.getElementById('income-id').value;
            const name = document.getElementById('income-name').value;
            const amount = parseFloat(document.getElementById('income-amount').value) || 0;
            const status = document.getElementById('income-status') ? document.getElementById('income-status').value : 'Confirmed';

            console.log("Debug: Inputs", { id, name, amount, status });

            if (!name) {
                alert('Please enter a name for the funding source.');
                return;
            }

            // Ensure we use the global project reference
            const proj = window._project;
            if (!proj) {
                alert("Error: Project not found in scope.");
                return;
            }
            // alert("Debug: Project found, saving...");

            if (!proj.incomeSources) proj.incomeSources = [];

            if (id) {
                // Update
                const source = proj.incomeSources.find(s => s.id === id);
                if (source) {
                    source.name = name;
                    source.amount = amount;
                    source.status = status;
                }
            } else {
                // Create
                proj.incomeSources.push({
                    id: Utils.generateId(),
                    name: name,
                    amount: amount,
                    status: status
                });
            }



            // console.log("Final Project State:", proj); // DEBUG

            try {
                // FORCE UI Update first to see if it's just visual latency
                // document.getElementById('modal-add-income').style.display = 'none'; 

                await Store.saveProject(proj);
                // alert("Source Saved Successfully!"); // Confirmation

                document.getElementById('modal-add-income').style.display = 'none';
                render();
            } catch (e) {
                alert("Error Saving: " + e.message);
                console.error(e);
            }
        }

        if (btn.classList.contains('btn-phase-settings')) {
            const pId = btn.dataset.phase;
            const phase = project.phases.find(p => p.id === pId);
            if (phase) {
                // Populate Modal
                document.getElementById('phase-settings-id').value = pId;
                document.getElementById('phase-name-edit').value = phase.name;
                document.getElementById('phase-weeks').value = phase.weeks || '';
                document.getElementById('phase-hours').value = phase.hours || '';
                document.getElementById('phase-pay-rate').value = phase.payRate || '';
                document.getElementById('phase-expense-rate').value = phase.expenseRate || '';

                document.getElementById('modal-phase-settings').style.display = 'flex';
            }
        }

        // Button: Worker Override
        if (btn.classList.contains('btn-worker-override')) {
            const pId = btn.dataset.phase;
            const wId = btn.dataset.worker;
            const phase = project.phases.find(p => p.id === pId);
            const member = project.teamMembers.find(m => m.id === wId);

            if (phase && member) {
                // Populate Modal
                document.getElementById('override-phase-id').value = pId;
                document.getElementById('override-worker-id').value = wId;
                document.getElementById('override-worker-name').textContent = member.name;

                // Toggle Sections based on Mode
                const mode = btn.dataset.mode; // 'rate' or 'schedule'
                const sectionRate = document.getElementById('section-override-rate');
                const sectionSched = document.getElementById('section-override-schedule');

                if (mode === 'rate') {
                    sectionRate.style.display = 'block';
                    sectionSched.style.display = 'none';
                    document.querySelector('#modal-worker-override .modal-header').textContent = 'Override Worker Rate';
                } else if (mode === 'schedule') {
                    sectionRate.style.display = 'none';
                    sectionSched.style.display = 'block';
                    document.querySelector('#modal-worker-override .modal-header').textContent = 'Override Worker Schedule';
                } else {
                    // Fallback (Show Both)
                    sectionRate.style.display = 'block';
                    sectionSched.style.display = 'block';
                    document.querySelector('#modal-worker-override .modal-header').textContent = 'Override Worker Specs';
                }

                const state = (phase.workers && phase.workers[wId]) || {};

                // Set Radio states (Simple implementation for now - reset to Auto if undefined)
                // In production, checking specific 'checked' attributes based on state is needed.
                // For MVP, we just open the modal. User re-selects if they want to change.

                // Show/Hide Inputs for existing values
                if (state.overrideRateMethod === 'custom') {
                    document.querySelector('input[name="rate-rule"][value="custom"]').checked = true;
                    document.getElementById('override-rate-val').style.display = 'inline-block';
                    document.getElementById('override-rate-val').value = state.overrideRateVal;
                } else if (state.overrideRateMethod) {
                    document.querySelector('input[name="rate-rule"][value="' + state.overrideRateMethod + '"]').checked = true;
                } else {
                    document.querySelector('input[name="rate-rule"][value="auto"]').checked = true;
                }

                if (state.overrideSchedMethod === 'custom-weekly') {
                    document.querySelector('input[name="sched-rule"][value="custom-weekly"]').checked = true;
                    document.getElementById('override-sched-weekly-val').style.display = 'inline-block';
                    document.getElementById('override-sched-weekly-val').value = state.overrideSchedWeeklyVal;
                } else if (state.overrideSchedMethod === 'lump') {
                    document.querySelector('input[name="sched-rule"][value="lump"]').checked = true;
                    document.getElementById('override-sched-lump-val').style.display = 'inline-block';
                    document.getElementById('override-sched-lump-val').value = state.overrideSchedLumpVal;
                } else if (state.overrideSchedMethod === 'project') {
                    document.querySelector('input[name="sched-rule"][value="project"]').checked = true;
                } else {
                    document.querySelector('input[name="sched-rule"][value="auto"]').checked = true;
                }

                document.getElementById('modal-worker-override').style.display = 'flex';
            }
        }

        // Button: Save Phase Settings
        if (btn.id === 'btn-save-phase-settings') {
            const pId = document.getElementById('phase-settings-id').value;
            const phase = project.phases.find(p => p.id === pId);
            if (phase) {
                phase.name = document.getElementById('phase-name-edit').value;
                phase.weeks = parseFloat(document.getElementById('phase-weeks').value) || 0;
                phase.hours = parseFloat(document.getElementById('phase-hours').value) || 0;
                phase.payRate = parseFloat(document.getElementById('phase-pay-rate').value) || null;
                phase.expenseRate = parseFloat(document.getElementById('phase-expense-rate').value) || null;

                Store.saveProject(project);
                render();
                document.getElementById('modal-phase-settings').style.display = 'none';
            }
        }

        // Button: Save Worker Override
        if (btn.id === 'btn-save-worker-override') {
            const pId = document.getElementById('override-phase-id').value;
            const wId = document.getElementById('override-worker-id').value;
            const phase = project.phases.find(p => p.id === pId);

            if (phase) {
                if (!phase.workers) phase.workers = {};
                if (!phase.workers[wId]) phase.workers[wId] = {};

                const wState = phase.workers[wId];

                // Get Rate Rule
                const rateRule = document.querySelector('input[name="rate-rule"]:checked').value;
                wState.overrideRateMethod = rateRule;
                if (rateRule === 'custom') {
                    wState.overrideRateVal = parseFloat(document.getElementById('override-rate-val').value) || 0;
                }

                // Get Schedule Rule
                const schedRule = document.querySelector('input[name="sched-rule"]:checked').value;
                wState.overrideSchedMethod = schedRule;
                if (schedRule === 'custom-weekly') {
                    wState.overrideSchedWeeklyVal = parseFloat(document.getElementById('override-sched-weekly-val').value) || 0;
                }
                if (schedRule === 'lump') {
                    wState.overrideSchedLumpVal = parseFloat(document.getElementById('override-sched-lump-val').value) || 0;
                }

                Store.saveProject(project);
                render();
                document.getElementById('modal-worker-override').style.display = 'none';
            }
        }
    });

    // 5. Global Change Listener (Toggles, Inputs)
    document.addEventListener('change', (e) => {
        const target = e.target;

        // Toggle Worker Presence
        if (target.classList.contains('cb-worker-present')) {
            // ...
        }

        // Project Wage Modifiers
        if (target.id === 'project-min-mod' || target.id === 'project-max-mod') {
            const minVal = parseFloat(document.getElementById('project-min-mod').value) || 100;
            const maxVal = parseFloat(document.getElementById('project-max-mod').value) || 100;

            project.minModifier = minVal;
            project.maxModifier = maxVal;

            Store.saveProject(project);
            render();
        }

        // Project Global Rates (Pay/Expense)
        if (target.id === 'project-global-pay-rate' || target.id === 'project-global-expense-rate') {
            project.payRate = parseFloat(document.getElementById('project-global-pay-rate').value) || 100;
            project.expenseRate = parseFloat(document.getElementById('project-global-expense-rate').value) || 100;

            Store.saveProject(project);
            render();
        }

        if (target.classList.contains('cb-worker-present')) {
            const pId = target.dataset.phase;
            const wId = target.dataset.worker;
            const phase = project.phases.find(p => p.id === pId);
            if (phase) {
                if (!phase.workers) phase.workers = {};
                if (!phase.workers[wId]) phase.workers[wId] = {};

                phase.workers[wId].isPresent = target.checked;
                Store.saveProject(project);
                render();
            }
        }

        // Toggle All Labor
        if (target.classList.contains('cb-toggle-all-labor')) {
            const pId = target.dataset.phase;
            const phase = project.phases.find(p => p.id === pId);
            if (phase) {
                if (!phase.workers) phase.workers = {};

                project.teamMembers.forEach(m => {
                    if (!phase.workers[m.id]) phase.workers[m.id] = {};
                    phase.workers[m.id].isPresent = target.checked;
                });
                Store.saveProject(project);
                render();
            }
        }

        // Toggle Phase Active/Inactive
        if (target.classList.contains('cb-phase-active')) {
            const pId = target.dataset.phase;
            const phase = project.phases.find(p => p.id === pId);
            if (phase) {
                phase.isActive = target.checked;
                Store.saveProject(project);
                render();
            }
        }

        // Modal Validations/Visibility (Radio Buttons)
        if (target.name === 'rate-rule') {
            const valInput = document.getElementById('override-rate-val');
            if (target.value === 'custom') {
                valInput.style.display = 'inline-block';
            } else {
                valInput.style.display = 'none';
            }
        }
        if (target.name === 'sched-rule') {
            document.getElementById('override-sched-weekly-val').style.display = 'none';
            document.getElementById('override-sched-lump-val').style.display = 'none';

            if (target.value === 'custom-weekly') document.getElementById('override-sched-weekly-val').style.display = 'inline-block';
            if (target.value === 'lump') document.getElementById('override-sched-lump-val').style.display = 'inline-block';
        }
    });

    // Init
    try {
        render();
    } catch (err) {
        console.error("Render Failed:", err);
    }

    // Globalize access for modal callbacks if needed
    // setupModalLogic(project, render); // Moved to end of file with try/catch

    function setupModalLogic(project, renderFn) {
        console.log("Debug: setupModalLogic temporarily disabled for syntax check.");
    }

    function _adjustDummyData() {
        console.log("Debug: _adjustDummyData temporarily disabled.");
    }

    // Call it
    setTimeout(_adjustDummyData, 1000);

    // Initial Render
    render();

    // [Duplicate renderDistributionModal removed]

    // --- Collaboration Logic ---

    // Expose Modal Opener
    window.openInviteModal = () => {
        const emailInput = document.getElementById('invite-email');
        if (emailInput) emailInput.value = '';
        const modal = document.getElementById('modal-invite-member');
        if (modal) modal.style.display = 'flex';
    };

    // Bind Confirm Button
    const btnConfirmInvite = document.getElementById('btn-confirm-invite');
    if (btnConfirmInvite) {
        btnConfirmInvite.onclick = async () => {
            const email = document.getElementById('invite-email').value.trim();
            const btn = document.getElementById('btn-confirm-invite');

            if (!email) {
                alert("Please enter an email.");
                return;
            }

            btn.innerText = "Inviting...";
            btn.disabled = true;

            try {
                // Ensure we have project ID
                const currentId = window._project ? window._project.id : (new URLSearchParams(window.location.search).get('id'));
                await Store.inviteUser(currentId, email);
                alert(`Invited ${email} successfully!`);
                document.getElementById('modal-invite-member').style.display = 'none';
                await loadAndRenderCollaborators();
            } catch (e) {
                alert("Error inviting user: " + e.message);
            } finally {
                btn.innerText = "Send Invite";
                btn.disabled = false;
            }
        };
    }

    async function loadAndRenderCollaborators() {
        try {
            const currentId = window._project ? window._project.id : (new URLSearchParams(window.location.search).get('id'));
            if (!currentId) return;

            const list = document.getElementById('collaborators-list');
            if (!list) return;

            // 1. Render Owner immediately (Client Side)
            list.innerHTML = '';
            const ownerName = (window._project && window._project.owner) ? window._project.owner : 'Owner';
            const ownerDiv = document.createElement('div');
            ownerDiv.className = 'summary-card';
            ownerDiv.style.padding = '10px';
            ownerDiv.style.minWidth = '200px';
            ownerDiv.innerHTML = `<strong>Owner</strong><br>${ownerName}`;
            list.appendChild(ownerDiv);

            // 2. Fetch Members
            const { data: memberData, error: memberError } = await window.supabaseClient
                .from('project_members')
                .select('user_id, role')
                .eq('project_id', currentId);

            if (memberError) throw memberError;

            // 3. Fetch Profiles (Members + Owner)
            let userIds = (memberData || []).map(m => m.user_id);

            // Add Owner ID if available
            const ownerId = window._project ? window._project.owner_id : null;
            if (ownerId && !userIds.includes(ownerId)) {
                userIds.push(ownerId);
            }

            if (userIds.length === 0) return;

            const { data: profileData, error: profileError } = await window.supabaseClient
                .from('profiles')
                .select('id, email, full_name, independent_profile')
                .in('id', userIds);

            if (profileError) throw profileError;

            // Map profiles
            const profileMap = {};
            if (profileData) {
                profileData.forEach(p => profileMap[p.id] = p);
            }

            // Helper to format stats
            const getStats = (p) => {
                const ip = p.independent_profile || {};
                let goalRate = ip.goals?.hourlyRateTarget || ip.goals?.hourly || 0;

                // Fallback: Calculate if missing
                if (!goalRate || goalRate === 0) {
                    try {
                        // We need to map 'independent_profile' to the structure BudgetEngine expects (which is usually the whole user object or the profile itself)
                        // BudgetEngine.getWorkerRates expects { unearnedIncome:..., schedule:..., goals:... }
                        // ip IS that structure.
                        const rates = BudgetEngine.getWorkerRates(ip);
                        if (rates && rates.goal) goalRate = rates.goal;
                    } catch (e) {
                        console.warn("Rate Calc Error", e);
                    }
                }

                const sched = ip.schedule || {};
                const hours = parseFloat(sched.hours) || 0;
                const days = parseFloat(sched.days) || 0;
                // const weeks = sched.weeks || 0; // Not needed for this specific display

                // Calculate Billable Capacity (accounting for Admin/Non-Billable work)
                // Use Utils (which is already loaded)
                const capacity = Utils.calculateBillableCapacity(ip);
                const pBillable = capacity.billableRatio || 0; // e.g., 0.85

                let stats = [];
                if (goalRate > 0) stats.push(`Goal: ${Utils.formatCurrency(goalRate)}/hr`);

                // Total Weekly Hours = Hours/Day * Days/Week (Already in variables hours, days)
                const totalWeeklyHours = hours * days;

                // Effective Billable Hours = Total * Ratio
                // Round to 1 decimal for cleanliness
                const effectiveBillable = Math.round((totalWeeklyHours * pBillable) * 10) / 10;

                if (effectiveBillable > 0) stats.push(`Billable Hours per week: ${effectiveBillable}`);

                return stats.length > 0 ? `<br><span style="font-size:0.7rem; color:#666; font-style:italic;">${stats.join(' • ')}</span>` : '';
            };

            // Update Owner Card with Real Name & Stats
            if (ownerId && profileMap[ownerId]) {
                const p = profileMap[ownerId];
                const statsHtml = getStats(p);
                ownerDiv.innerHTML = `<strong>Owner</strong><br>${p.full_name || 'Unknown Name'}<br><span style="font-size:0.7rem; color:gray;">${p.email}</span>${statsHtml}`;
            }

            // 5. Fetch Pending Invites (Project Invites table)
            const { data: inviteData } = await window.supabaseClient
                .from('project_invites')
                .select('email, invited_at')
                .eq('project_id', currentId);

            // Render Pending Invites
            if (inviteData && inviteData.length > 0) {
                inviteData.forEach(inv => {
                    const d = document.createElement('div');
                    d.className = 'summary-card';
                    d.style.padding = '10px';
                    d.style.minWidth = '200px';
                    d.style.border = '1px dashed #ccc'; // Distinct style for pending
                    d.innerHTML = `<strong>Invited</strong><br>${inv.email}<br><span style="font-size:0.7rem; color:orange;">Pending Signup</span>`;
                    list.appendChild(d);
                });
            }

            // 4. Render Members (Skip Owner)
            if (memberData) {
                memberData.forEach(m => {
                    const profile = profileMap[m.user_id];
                    if (profile) {
                        if (profile.id === ownerId) return; // Skip Owner if in list
                        const d = document.createElement('div');
                        d.className = 'summary-card';
                        d.style.padding = '10px';
                        d.style.minWidth = '200px';
                        const statsHtml = getStats(profile);
                        d.innerHTML = `<strong>${profile.full_name || 'Collaborator'}</strong><br>${profile.email}<br><span style="font-size:0.7rem; color:gray;">${m.role}</span>${statsHtml}`;
                        list.appendChild(d);
                    }
                });
            }

        } catch (err) {
            console.error("Error loading collaborators:", err);
            const list = document.getElementById('collaborators-list');
            // DEBUG: Show actual error on screen
            if (list) list.innerHTML += `<div style="color:red; font-size:0.8rem;">Error: ${err.message || err.toString()}</div>`;
        }
    }

    // Explicitly Expose
    window.loadAndRenderCollaborators = loadAndRenderCollaborators;

    // --- Final Init ---
    try {
        setupModalLogic(project, render);
    } catch (e) { console.error("Modal Logic Error", e); }

    try {
        await loadAndRenderCollaborators();
    } catch (e) { console.error("Collab Logic Error", e); }

});
