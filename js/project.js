/**
 * Advanced Project Dashboard Logic
 * Uses BudgetEngine for complex rate calculations.
 */

document.addEventListener('DOMContentLoaded', () => {
    // 2. State & Init
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');

    if (!projectId) {
        window.location.href = 'projects.html';
        return;
    }

    let project = Store.getProject(projectId);
    if (!project) {
        alert('Project not found');
        window.location.href = 'projects.html';
        return;
    }

    // Load ALL users to map profiles for calculations
    const usersMap = Store.getUsers();

    // 2b. Auth & Header Check
    const currentUser = Store.checkSession();
    if (currentUser) {
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.textContent = 'User: ' + currentUser;
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
            const user = Store.getUsers()[m.username] || {};
            const profile = user.independentProfile;
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
    document.addEventListener('click', (e) => {
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
        }

        // Button: Save New Phase
        if (btn.id === 'btn-save-new-phase') {
            const name = document.getElementById('new-phase-name').value;
            if (name && name.trim() !== "") {
                project.phases.push({
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    isActive: true, // Auto-enabled
                    lineItems: [],
                    schedule: {}
                });
                Store.saveProject(project);
                render();
                document.getElementById('modal-add-phase').style.display = 'none';
            } else {
                alert("Please enter a phase name.");
            }
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
            const source = project.incomeSources.find(s => s.id === id);
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

        // Button: Add Funding (Open Modal)
        if (btn.id === 'btn-open-income-modal') {
            document.getElementById('modal-add-income').style.display = 'flex';
        }

        // Button: Phase Settings
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
    setupModalLogic(project, render);

    function setupModalLogic(project, renderFn) {
        const modal = document.getElementById('modal-add-member');
        const inputEmail = document.getElementById('invite-email');
        const btnLookup = document.getElementById('btn-lookup-email');
        const stepLookup = document.getElementById('step-lookup');
        const stepDetails = document.getElementById('step-details');
        const statusMsg = document.getElementById('invite-status-msg');
        const btnSave = document.getElementById('btn-save-member');

        let foundUser = null;

        // Exposed global functions for HTML onclicks
        window.closeModal = () => {
            modal.style.display = 'none';
            window.resetModal();
        };

        window.resetModal = () => {
            inputEmail.value = '';
            stepLookup.style.display = 'block';
            if (stepDetails) stepDetails.style.display = 'none';
            if (btnSave) {
                btnSave.style.display = 'none';
                btnSave.onclick = null; // Clear previous listeners to prevent duplicates
            }
            if (statusMsg) statusMsg.textContent = '';

            foundUser = null;

            // Show inputs again (reset hiding from Pool Add)
            const rateInput = document.getElementById('new-member-rate');
            const daysInput = document.getElementById('new-member-days');
            if (rateInput && rateInput.parentElement) rateInput.parentElement.style.display = 'block';
            if (daysInput && daysInput.parentElement) daysInput.parentElement.style.display = 'block';
        };

        if (btnLookup) {
            btnLookup.onclick = () => {
                const email = inputEmail.value.trim();
                if (!email) return alert('Enter an email');

                const user = Store.findUserByEmail(email);
                if (stepDetails) stepDetails.style.display = 'block';

                // For POOL ADD context, we hide rate/days
                const rateInput = document.getElementById('new-member-rate');
                const daysInput = document.getElementById('new-member-days');
                if (rateInput && rateInput.parentElement) rateInput.parentElement.style.display = 'none';
                if (daysInput && daysInput.parentElement) daysInput.parentElement.style.display = 'none';

                if (user) {
                    foundUser = user;
                    statusMsg.textContent = `Found: ${user.fullName}`;
                    statusMsg.style.color = 'green';
                    btnSave.style.display = 'block';
                    btnSave.textContent = "Add to Contact Pool"; // Rename button

                    // Re-bind save
                    btnSave.onclick = () => {
                        // Check if already in pool
                        const exists = project.teamMembers.find(m => m.username === user.username);
                        if (exists) {
                            alert('User already in pool');
                            return;
                        }

                        project.teamMembers.push({
                            id: crypto.randomUUID(),
                            name: user.fullName,
                            username: user.username,
                            email: user.email,
                            rate: 0, // Default placeholders
                            days: 0
                        });
                        Store.saveProject(project);
                        window.closeModal();
                        renderFn();
                    };

                } else {
                    foundUser = null;
                    statusMsg.textContent = "User not found. (Invite feature coming soon)";
                    statusMsg.style.color = 'orange';
                    btnSave.style.display = 'none';
                }
            };
        }

        // Helper: Render Distribution Modal
        function renderDistributionModal(scenarioKey) {
            const modal = document.getElementById('modal-distribution');
            const list = document.getElementById('dist-list');
            list.innerHTML = '';

            // Determine Income based on Scenario
            // 'confirmed', 'possible', 'ideal'
            const income = project.incomeSources || [];
            let incomeTotal = 0;

            const sumConfirmed = income.filter(i => i.status === 'Confirmed').reduce((s, i) => s + i.amount, 0);
            const sumLikely = income.filter(i => i.status === 'Likely').reduce((s, i) => s + i.amount, 0);
            const sumUnconfirmed = income.filter(i => i.status === 'Unconfirmed').reduce((s, i) => s + i.amount, 0);

            if (scenarioKey === 'confirmed') incomeTotal = sumConfirmed;
            if (scenarioKey === 'possible') incomeTotal = sumConfirmed + sumLikely;
            if (scenarioKey === 'ideal') incomeTotal = sumConfirmed + sumLikely + sumUnconfirmed;

            // Calculate Costs
            const cashCosts = calculateProjectTotal(); // Recalc to ensure fresh ledger

            // Calculate Liability
            let totalLiability = 0;
            if (window._projectLedger) {
                Object.values(window._projectLedger).forEach(e => totalLiability += e.equity);
            }

            // Calculate Waterfall
            const dist = calculateDistribution(incomeTotal, cashCosts, totalLiability);

            // Update Summary Header
            document.getElementById('dist-income').textContent = Utils.formatCurrency(incomeTotal);
            document.getElementById('dist-cost').textContent = Utils.formatCurrency(cashCosts);
            document.getElementById('dist-liability').textContent = Utils.formatCurrency(totalLiability);
            document.getElementById('dist-distributable').textContent = Utils.formatCurrency(dist.distributable);

            document.getElementById('dist-actual-profit').textContent = Utils.formatCurrency(dist.netProfit);
            if (dist.netProfit >= 0) {
                document.getElementById('dist-actual-profit').parentElement.style.background = '#e8f5e9';
                document.getElementById('dist-actual-profit').style.color = 'var(--color-primary)';
            } else {
                document.getElementById('dist-actual-profit').parentElement.style.background = '#ffebee';
                document.getElementById('dist-actual-profit').style.color = 'red';
            }

            // Render Rows per Worker
            if (window._projectLedger) {
                Object.values(window._projectLedger).forEach(entry => {
                    // Share Calculation
                    // Rule: (My Goal - My Rate) * My Hours ?
                    // The ledger already has 'equity' calculated as the liability amount.
                    // We need to determine their PAYOUT share.
                    // Payout Share = (My Liability / Total Liability) * Total Payout

                    let myPayout = 0;
                    if (totalLiability > 0) {
                        const share = entry.equity / totalLiability;
                        myPayout = dist.payout * share;
                    }

                    const remaining = entry.equity - myPayout;

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                    <td>${entry.name}</td>
                    <td>${Utils.formatCurrency(entry.equity)}</td>
                    <td style="font-weight:bold; color:var(--color-primary);">${Utils.formatCurrency(myPayout)}</td>
                    <td style="color:${remaining > 0 ? 'red' : 'green'};">${Utils.formatCurrency(remaining)}</td>
                `;
                    list.appendChild(tr);
                });
            }

            modal.style.display = 'flex';
        }


        // 4. Global Event Delegation (Robust Handling) - ADDENDUM for Distribution
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            if (btn.classList.contains('btn-text-action') && btn.dataset.scenario) {
                renderDistributionModal(btn.dataset.scenario);
            }
        });

        // NOTE: Main delegation block is above, this appends a specific listener or could be merged.
        // Ideally merged, but safe to add separate listener for robustness here.
        const btnSaveIncome = document.getElementById('btn-save-income');
        if (btnSaveIncome) {
            btnSaveIncome.onclick = () => {
                const name = document.getElementById('income-name').value;
                const amount = parseFloat(document.getElementById('income-amount').value);
                const status = document.getElementById('income-status').value;

                if (!name || isNaN(amount)) {
                    alert('Please enter a valid name and amount.');
                    return;
                }

                const id = document.getElementById('income-id').value;
                if (id) {
                    // Update existing
                    const source = project.incomeSources.find(s => s.id === id);
                    if (source) {
                        source.name = name;
                        source.amount = amount;
                        source.status = status;
                    }
                } else {
                    // Create new
                    project.incomeSources.push({
                        id: crypto.randomUUID(),
                        name: name,
                        amount: amount,
                        status: status
                    });
                }

                Store.saveProject(project);
                document.getElementById('modal-add-income').style.display = 'none';

                // Clear inputs
                document.getElementById('income-id').value = '';
                document.getElementById('income-name').value = '';
                document.getElementById('income-amount').value = '';

                renderFn();
            };
        }
    } // End setupModalLogic

    // --- DEBUG / TESTING HELPER ---
    // Run this once to adjust dummy data as requested
    function _adjustDummyData() {
        if (localStorage.getItem('pin_debug_adjusted_v2')) return;

        const users = Store.getUsers();
        const keys = Object.keys(users);
        let count = 0;

        keys.forEach(k => {
            if (count >= 2) return;
            const u = users[k];
            // Skip if it looks like the main user (optional heuristic)
            if (u.username === Store.getCurrentUser()) return;

            // Boost Goal to ensures High Goal Rate
            if (!u.independentProfile.goals) u.independentProfile.goals = {};
            u.independentProfile.goals.gross = 250000; // High Goal
            u.independentProfile.goals.current = 60000; // Moderate Now

            // Ensure valid schedule for calc
            if (!u.independentProfile.schedule) u.independentProfile.schedule = {};
            u.independentProfile.schedule.weeks = 48;
            u.independentProfile.schedule.days = 5;
            u.independentProfile.schedule.hours = 8;

            count++;
        });

        if (count > 0) {
            Store.saveUsers(users);
            localStorage.setItem('pin_debug_adjusted_v2', 'true');
            console.log("Debug: Adjusted " + count + " users to have high goals.");
            location.reload(); // Refresh to see changes
        }
    }

    // Call it
    setTimeout(_adjustDummyData, 1000);

    // Initial Render
    render();

    // Helper: Render Distribution Modal
    function renderDistributionModal(scenarioKey) {
        try {
            const modal = document.getElementById('modal-distribution');
            const list = document.getElementById('dist-list');
            list.innerHTML = '';

            // Determine Income based on Scenario
            // 'confirmed', 'possible', 'ideal'
            const income = project.incomeSources || [];
            let incomeTotal = 0;

            const sumConfirmed = income.filter(i => i.status === 'Confirmed').reduce((s, i) => s + i.amount, 0);
            const sumLikely = income.filter(i => i.status === 'Likely').reduce((s, i) => s + i.amount, 0);
            const sumUnconfirmed = income.filter(i => i.status === 'Unconfirmed').reduce((s, i) => s + i.amount, 0);

            if (scenarioKey === 'confirmed') incomeTotal = sumConfirmed;
            if (scenarioKey === 'possible') incomeTotal = sumConfirmed + sumLikely;
            if (scenarioKey === 'ideal') incomeTotal = sumConfirmed + sumLikely + sumUnconfirmed;

            // Calculate Costs
            const cashCosts = calculateProjectTotal(); // Recalc to ensure fresh ledger

            // Calculate Liability
            let totalLiability = 0;
            if (window._projectLedger) {
                Object.values(window._projectLedger).forEach(e => totalLiability += e.equity);
            }

            // Calculate Waterfall
            const dist = calculateDistribution(incomeTotal, cashCosts, totalLiability);

            // Update Summary Header
            document.getElementById('dist-income').textContent = Utils.formatCurrency(incomeTotal);
            document.getElementById('dist-cost').textContent = Utils.formatCurrency(cashCosts);
            document.getElementById('dist-liability').textContent = Utils.formatCurrency(totalLiability);
            document.getElementById('dist-distributable').textContent = Utils.formatCurrency(dist.distributable);

            document.getElementById('dist-actual-profit').textContent = Utils.formatCurrency(dist.netProfit);
            if (dist.netProfit >= 0) {
                document.getElementById('dist-actual-profit').parentElement.style.background = '#e8f5e9';
                document.getElementById('dist-actual-profit').style.color = 'var(--color-primary)';
            } else {
                document.getElementById('dist-actual-profit').parentElement.style.background = '#ffebee';
                document.getElementById('dist-actual-profit').style.color = 'red';
            }

            // Render Rows per Worker
            if (window._projectLedger) {
                Object.values(window._projectLedger).forEach(entry => {
                    // Share Calculation
                    // Rule: (My Goal - My Rate) * My Hours ?
                    // The ledger already has 'equity' calculated as the liability amount.
                    // We need to determine their PAYOUT share.
                    // Payout Share = (My Liability / Total Liability) * Total Payout

                    let myPayout = 0;
                    if (totalLiability > 0) {
                        const share = entry.equity / totalLiability;
                        myPayout = dist.payout * share;
                    }

                    const remaining = entry.equity - myPayout;

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${entry.name}</td>
                        <td>${Utils.formatCurrency(entry.equity)}</td>
                        <td style="font-weight:bold; color:var(--color-primary);">${Utils.formatCurrency(myPayout)}</td>
                        <td style="color:${remaining > 0 ? 'red' : 'green'};">${Utils.formatCurrency(remaining)}</td>
                    `;
                    list.appendChild(tr);
                });
            }

            modal.style.display = 'flex';
        } catch (err) {
            console.error("Distribution Modal Error:", err);
            // alert("Error showing distribution: " + err.message); // Silent fail preferred now? Or robust alert?
            // Let's keep it silent or minimal log now that logic is fixed.
        }
    }
    // Expose globally for inline onclicks
    window.renderDistributionModal = renderDistributionModal;

    // Distribution Modal Click Listener
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('btn-text-action') && btn.dataset.scenario) {
            renderDistributionModal(btn.dataset.scenario);
        }
    });

});
