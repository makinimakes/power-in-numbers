/**
 * Independent Tool Logic - Final Refactor
 */

// Global Toggle Function
window.toggleSection = (id, btn) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('hidden');
        btn.classList.toggle('collapsed');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Get Elements
    const inputs = {
        weeks: document.getElementById('in-weeks'),
        days: document.getElementById('in-days'),
        hours: document.getElementById('in-hours'),
        taxRate: document.getElementById('in-tax-rate'),
        // Dynamic expenses handled by Manager
    };

    const outputs = {
        goalNet: document.getElementById('out-goal-net'),
        goalGross: document.getElementById('out-goal-gross'),
        dayRate: document.getElementById('out-day-rate'),

        totalWorkHours: document.getElementById('out-total-work-hours'),
        totalNonBillable: document.getElementById('out-total-non-billable-hours'),
        totalBillable: document.getElementById('out-total-billable-hours')
    };

    // 2. State Management
    let profile = {}; // Init empty, load in async init()

    // -------------------------------------------------------------------------
    // HELPERS & NORMALIZATION
    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // HELPERS & NORMALIZATION
    // -------------------------------------------------------------------------
    const Normalizer = Utils.Normalizer;

    // -------------------------------------------------------------------------
    // EXPENSE MANAGER
    // -------------------------------------------------------------------------
    const ExpenseManager = {
        container: document.getElementById('expenses-container'),

        render: () => {
            ExpenseManager.container.innerHTML = '';

            profile.expenses.items.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'ledger-row';
                row.style.display = 'grid';
                row.style.gridTemplateColumns = '2fr 1fr 1fr 1fr auto';
                row.style.gap = '10px';
                row.style.alignItems = 'center';

                const showFreq = item.type === 'Periodic';

                row.innerHTML = `
                    <input type="text" value="${item.label}" placeholder="Category" onchange="updateExpense(${index}, 'label', this.value)">
                    <input type="number" value="${item.amount}" placeholder="Amount" onchange="updateExpense(${index}, 'amount', this.value)">
                    <select onchange="updateExpense(${index}, 'type', this.value)">
                        <option value="Monthly" ${item.type === 'Monthly' ? 'selected' : ''}>Monthly</option>
                        <option value="Periodic" ${item.type === 'Periodic' ? 'selected' : ''}>Periodic (x/Yr)</option>
                        <option value="Percent" ${item.type === 'Percent' ? 'selected' : ''}>% of Total</option>
                    </select>
                     <input type="number" value="${item.frequency || 1}" placeholder="Freq" 
                        style="visibility: ${showFreq ? 'visible' : 'hidden'}; width: 60px;"
                        onchange="updateExpense(${index}, 'frequency', this.value)">
                    <button onclick="removeExpense(${index})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
                `;
                ExpenseManager.container.appendChild(row);
            });
        },

        addExpense: () => {
            profile.expenses.items.push({
                id: crypto.randomUUID(),
                label: '',
                amount: 0,
                type: 'Monthly',
                frequency: 1
            });
            ExpenseManager.render();
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        },

        removeExpense: (index) => {
            if (confirm('Remove this expense?')) {
                profile.expenses.items.splice(index, 1);
                ExpenseManager.render();
                calculateAndDisplay();
                Store.saveIndependentProfile(profile);
            }
        },

        updateExpense: (index, field, value) => {
            const val = (field === 'amount' || field === 'frequency') ? parseFloat(value) : value;
            profile.expenses.items[index][field] = val;
            if (field === 'type') ExpenseManager.render();

            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        }
    };

    // -------------------------------------------------------------------------
    // INCOME MANAGER (Unearned)
    // -------------------------------------------------------------------------
    const IncomeManager = {
        container: document.getElementById('unearned-income-container'),

        render: () => {
            IncomeManager.container.innerHTML = '';

            profile.unearnedIncome.items.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'ledger-row';
                row.style.display = 'grid';
                row.style.gridTemplateColumns = '2fr 1fr 1fr 1fr auto';
                row.style.gap = '10px';
                row.style.alignItems = 'center';

                const showFreq = item.type === 'Periodic';

                row.innerHTML = `
                    <input type="text" value="${item.label}" placeholder="Source" onchange="updateIncome(${index}, 'label', this.value)">
                    <input type="number" value="${item.amount}" placeholder="Amount" onchange="updateIncome(${index}, 'amount', this.value)">
                    <select onchange="updateIncome(${index}, 'type', this.value)">
                        <option value="Annual" ${item.type === 'Annual' ? 'selected' : ''}>Annual</option>
                        <option value="Monthly" ${item.type === 'Monthly' ? 'selected' : ''}>Monthly</option>
                        <option value="Periodic" ${item.type === 'Periodic' ? 'selected' : ''}>Periodic (x/Yr)</option>
                    </select>
                     <input type="number" value="${item.frequency || 1}" placeholder="Freq" 
                        style="visibility: ${showFreq ? 'visible' : 'hidden'}; width: 60px;"
                        onchange="updateIncome(${index}, 'frequency', this.value)">
                    <button onclick="removeIncome(${index})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
                `;
                IncomeManager.container.appendChild(row);
            });
        },

        addIncome: () => {
            profile.unearnedIncome.items.push({
                id: crypto.randomUUID(),
                label: '',
                amount: 0,
                type: 'Annual',
                frequency: 1
            });
            IncomeManager.render();
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        },

        removeIncome: (index) => {
            if (confirm('Remove this income source?')) {
                profile.unearnedIncome.items.splice(index, 1);
                IncomeManager.render();
                calculateAndDisplay();
                Store.saveIndependentProfile(profile);
            }
        },

        updateIncome: (index, field, value) => {
            const val = (field === 'amount' || field === 'frequency') ? parseFloat(value) : value;
            profile.unearnedIncome.items[index][field] = val;
            if (field === 'type') IncomeManager.render();

            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        }
    };


    // -------------------------------------------------------------------------
    // LINE OF WORK MANAGER
    // -------------------------------------------------------------------------
    const LineManager = {
        container: document.getElementById('lines-of-work-container'),

        render: () => {
            LineManager.container.innerHTML = '';

            // Current input values needed for calculations
            const globalWeeks = parseFloat(inputs.weeks.value) || 0;
            const globalDays = parseFloat(inputs.days.value) || 0;
            const globalHours = parseFloat(inputs.hours.value) || 0;

            profile.linesOfWork.forEach((line, lineIndex) => {
                const card = document.createElement('div');
                card.className = 'grid-card';
                card.style.marginBottom = 'var(--spacing-md)';
                card.style.padding = 'var(--spacing-sm)';
                card.style.border = '1px solid var(--color-border)';

                // header
                const header = document.createElement('div');
                header.style.display = 'flex';
                header.style.justifyContent = 'space-between';
                header.style.marginBottom = 'var(--spacing-sm)';
                header.style.borderBottom = '1px dotted var(--color-border)';
                header.style.paddingBottom = 'var(--spacing-xs)';

                header.innerHTML = `
                    <div style="display:flex; gap: var(--spacing-sm); width: 100%;">
                        <div style="flex-grow:1;">
                            <label style="font-size:0.6rem;">Role / Line of Work</label>
                            <input type="text" value="${line.label}" onchange="updateLine(${lineIndex}, 'label', this.value)" style="width:100%;">
                        </div>
                        <div style="width: 80px;">
                            <label style="font-size:0.6rem;">Duration</label>
                            <input type="number" value="${line.duration.value}" onchange="updateLineDuration(${lineIndex}, 'value', this.value)" placeholder="0">
                        </div>
                        <div style="width: 90px;">
                             <label style="font-size:0.6rem;">Unit</label>
                             <select onchange="updateLineDuration(${lineIndex}, 'unit', this.value)">
                                <option value="Weeks" ${line.duration.unit === 'Weeks' ? 'selected' : ''}>Weeks</option>
                                <option value="Months" ${line.duration.unit === 'Months' ? 'selected' : ''}>Months</option>
                                <option value="% of Year" ${line.duration.unit === '% of Year' ? 'selected' : ''}>% of Year</option>
                             </select>
                        </div>
                    </div>
                    <button onclick="removeLine(${lineIndex})" style="color:red; background:none; border:none; cursor:pointer; font-size:1.2rem; line-height:1;">&times;</button>
                `;
                card.appendChild(header);

                // Activities Container
                const actsContainer = document.createElement('div');

                // Activities Label & Add Btn
                const subHeader = document.createElement('div');
                subHeader.style.display = 'flex';
                subHeader.style.justifyContent = 'space-between';
                subHeader.style.marginBottom = 'var(--spacing-xs)';
                subHeader.innerHTML = `
                     <div style="font-size:0.7rem; font-weight:bold;">NON-BILLABLE ACTIVITIES</div>
                     <button onclick="addActivity(${lineIndex})" style="font-size:0.7rem; cursor:pointer;">+ Service</button>
                `;
                card.appendChild(subHeader);

                // Render Activities
                line.activities.forEach((act, actIndex) => {
                    const lineWeeks = Normalizer.getLineWeeks(line.duration.value, line.duration.unit, globalWeeks);
                    // Pass current global values
                    const annualHours = Normalizer.getActivityAnnualHours(act, lineWeeks, globalDays, globalHours);

                    const isInvalid = annualHours === -1;

                    const displayValue = isInvalid ?
                        `<span style="color:var(--color-accent-surviving); font-weight:bold; font-size:0.6rem;">please revise your selections</span>` :
                        `≈ ${Math.round(annualHours)} hrs`;

                    const actRow = document.createElement('div');
                    actRow.style.display = 'grid';
                    actRow.style.gridTemplateColumns = '2fr 1fr 1fr 1fr auto auto';
                    actRow.style.gap = '5px';
                    actRow.style.marginBottom = '5px';
                    actRow.style.alignItems = 'center';

                    actRow.innerHTML = `
                        <div>
                            <input type="text" placeholder="Activity Name" value="${act.label}" onchange="updateAct(${lineIndex}, ${actIndex}, 'label', this.value)">
                        </div>
                        <div>
                            <input type="number" placeholder="#" value="${act.amount}" onchange="updateAct(${lineIndex}, ${actIndex}, 'amount', this.value)">
                        </div>
                        <div>
                             <select onchange="updateAct(${lineIndex}, ${actIndex}, 'unit', this.value)" style="font-size:0.7rem;">
                                <option value="Hours" ${act.unit === 'Hours' ? 'selected' : ''}>Hours</option>
                                <option value="Days" ${act.unit === 'Days' ? 'selected' : ''}>Work Days</option>
                                <option value="Weeks" ${act.unit === 'Weeks' ? 'selected' : ''}>Work Weeks</option>
                                <option value="Months" ${act.unit === 'Months' ? 'selected' : ''}>Work Months</option>
                            </select>
                        </div>
                        <div>
                             <select onchange="updateAct(${lineIndex}, ${actIndex}, 'frequency', this.value)" style="font-size:0.7rem;">
                                <option value="Per Day" ${act.frequency === 'Per Day' ? 'selected' : ''}>Per Work Day</option>
                                <option value="Per Week" ${act.frequency === 'Per Week' ? 'selected' : ''}>Per Work Week</option>
                                <option value="Per Month" ${act.frequency === 'Per Month' ? 'selected' : ''}>Per Work Month</option>
                                <option value="Per Year" ${act.frequency === 'Per Year' ? 'selected' : ''}>Per Work Year</option>
                            </select>
                        </div>
                        <div style="font-size: 0.7rem; color: var(--color-text-muted); white-space: nowrap;">
                            ${displayValue}
                        </div>
                        <button onclick="removeActivity(${lineIndex}, ${actIndex})" style="border:none; bg:none; cursor:pointer;">&times;</button>
                    `;
                    actsContainer.appendChild(actRow);
                });

                card.appendChild(actsContainer);
                LineManager.container.appendChild(card);
            });
        },

        addLine: () => {
            profile.linesOfWork.push({
                id: crypto.randomUUID(),
                label: 'New Line of Work',
                duration: { value: 52, unit: 'Weeks' },
                activities: []
            });
            LineManager.render();
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        },

        removeLine: (index) => {
            if (confirm('Delete this line of work?')) {
                profile.linesOfWork.splice(index, 1);
                LineManager.render();
                calculateAndDisplay();
                Store.saveIndependentProfile(profile);
            }
        },

        updateLine: (index, field, value) => {
            profile.linesOfWork[index][field] = value;
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        },

        // Validation State
        pendingOverride: null,

        updateLineDuration: (index, subField, value) => {
            const newVal = subField === 'value' ? parseFloat(value) : value;
            const currentObj = profile.linesOfWork[index].duration;

            // Proposed new duration state
            const proposedValue = subField === 'value' ? newVal : currentObj.value;
            const proposedUnit = subField === 'unit' ? newVal : currentObj.unit;

            // Check against Global Schedule
            const globalWeeks = parseFloat(inputs.weeks.value) || 0;
            const proposedWeeks = Normalizer.getLineWeeks(proposedValue, proposedUnit, globalWeeks);

            if (proposedWeeks > globalWeeks) {
                // Store pending state and show modal
                LineManager.pendingOverride = { index, subField, value: newVal };

                const msg = `This duration (<strong>${Math.round(proposedWeeks)} weeks</strong>) exceeds your declared Time Reclaimed Schedule (<strong>${globalWeeks} weeks</strong>).<br><br>Do you want to override and keep this duration?`;
                document.getElementById('modal-override-msg').innerHTML = msg;
                document.getElementById('modal-override').showModal();
                return;
            }

            // Apply Change immediately if no warning
            profile.linesOfWork[index].duration[subField] = newVal;
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
            if (subField === 'unit') LineManager.render();
        },

        confirmOverride: () => {
            if (LineManager.pendingOverride) {
                const { index, subField, value } = LineManager.pendingOverride;
                profile.linesOfWork[index].duration[subField] = value;
                calculateAndDisplay();
                Store.saveIndependentProfile(profile);
                if (subField === 'unit') LineManager.render();
                LineManager.pendingOverride = null;
            }
            document.getElementById('modal-override').close();
        },

        cancelOverride: () => {
            LineManager.pendingOverride = null;
            document.getElementById('modal-override').close();
            // Revert UI to previous state by re-rendering
            LineManager.render();
        },

        // Activity Methods
        addActivity: (lineIndex) => {
            profile.linesOfWork[lineIndex].activities.push({
                label: '',
                amount: 0,
                unit: 'Hours',
                frequency: 'Per Week'
            });
            LineManager.render();
            // Dont save yet, wait for edits
            Store.saveIndependentProfile(profile);
        },

        removeActivity: (lineIndex, actIndex) => {
            profile.linesOfWork[lineIndex].activities.splice(actIndex, 1);
            LineManager.render();
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        },

        updateActivity: (lineIndex, actIndex, field, value) => {
            const val = (field === 'amount') ? parseFloat(value) : value;
            profile.linesOfWork[lineIndex].activities[actIndex][field] = val;
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        }
    };

    // GLOBAL EXPORTS for Inline Events
    window.updateLine = LineManager.updateLine;
    window.updateLineDuration = LineManager.updateLineDuration;
    window.removeLine = LineManager.removeLine;
    window.addActivity = LineManager.addActivity;
    window.removeActivity = LineManager.removeActivity;
    window.updateAct = LineManager.updateActivity;

    // Validation Exports
    window.confirmOverride = LineManager.confirmOverride;
    window.cancelOverride = LineManager.cancelOverride;

    // Expense Exports
    window.updateExpense = ExpenseManager.updateExpense;
    window.removeExpense = ExpenseManager.removeExpense;

    // Income Exports
    window.updateIncome = IncomeManager.updateIncome;
    window.removeIncome = IncomeManager.removeIncome;

    document.getElementById('btn-add-line-of-work').onclick = LineManager.addLine;
    document.getElementById('btn-add-expense').onclick = ExpenseManager.addExpense;
    document.getElementById('btn-add-income').onclick = IncomeManager.addIncome;

    // -------------------------------------------------------------------------
    // CALCULATIONS & UI UPDATES
    // -------------------------------------------------------------------------
    function calculateAndDisplay() {
        const weeks = parseFloat(inputs.weeks.value) || 0;
        const days = parseFloat(inputs.days.value) || 0;
        const hours = parseFloat(inputs.hours.value) || 0;
        const taxRate = parseFloat(inputs.taxRate.value) || 0;

        // 0. Sync Inputs to Profile for Calculation
        if (!profile.schedule) profile.schedule = {};
        profile.schedule.weeks = weeks;
        profile.schedule.days = days;
        profile.schedule.hours = hours;

        if (!profile.expenses) profile.expenses = {};
        profile.expenses.taxRate = taxRate;

        // 1. Calculate Schedule & Capacity via Utils
        const capacity = Utils.calculateBillableCapacity(profile);

        const totalWorkHours = capacity.totalWorkHours;
        const totalNonBillableHours = capacity.totalNonBillableHours;
        const totalBillableHours = capacity.totalBillableHours;

        // Update Hours UI
        const nbPercent = totalWorkHours > 0 ? (totalNonBillableHours / totalWorkHours) * 100 : 0;
        const bPercent = totalWorkHours > 0 ? (totalBillableHours / totalWorkHours) * 100 : 0;

        // Save Billable Ratio for other tools (Calibrations)
        profile.billableRatio = capacity.billableRatio;
        Store.saveIndependentProfile(profile);

        outputs.totalWorkHours.textContent = Math.round(totalWorkHours).toLocaleString();
        outputs.totalNonBillable.innerHTML = `${Math.round(totalNonBillableHours).toLocaleString()} <span style="font-size:0.7em; opacity:0.7;">(${Math.round(nbPercent)}%)</span>`;
        outputs.totalBillable.innerHTML = `${Math.round(totalBillableHours).toLocaleString()} <span style="font-size:0.7em; opacity:0.7;">(${Math.round(bPercent)}%)</span>`;

        // Update Dock Hours
        const dockNonBillable = document.getElementById('out-dock-total-non-billable');
        const dockBillable = document.getElementById('out-dock-total-billable');
        if (dockNonBillable) dockNonBillable.textContent = Math.round(totalNonBillableHours).toLocaleString();
        if (dockBillable) dockBillable.textContent = Math.round(totalBillableHours).toLocaleString();

        // 4. Expenses
        let fixedSum = 0;
        let percentSum = 0;

        profile.expenses.items.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            if (item.type === 'Monthly') {
                fixedSum += amount * 12;
            } else if (item.type === 'Periodic') {
                const freq = parseFloat(item.frequency) || 1;
                fixedSum += amount * freq;
            } else if (item.type === 'Percent') {
                percentSum += amount;
            }
        });

        // 5. Unearned Income (Reduces Goal Net)
        let unearnedSum = 0;
        profile.unearnedIncome.items.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            if (item.type === 'Monthly') {
                unearnedSum += amount * 12;
            } else if (item.type === 'Periodic') {
                const freq = parseFloat(item.frequency) || 1;
                unearnedSum += amount * freq;
            } else { // Annual
                unearnedSum += amount;
            }
        });

        // Update Total Unearned Display
        const unearnedTotalEl = document.getElementById('out-total-unearned-income');
        if (unearnedTotalEl) {
            unearnedTotalEl.textContent = Utils.formatCurrency(unearnedSum);
        }

        // Goal Net (Total) = Fixed / (1 - Percent/100)
        let goalNetTotal = 0;
        if (percentSum < 100) {
            goalNetTotal = fixedSum / (1 - (percentSum / 100));
        } else {
            goalNetTotal = Infinity;
        }

        // Goal Net (From Work) = Total Goal - Unearned (DECOUPLED per request: Now just Total Goal)
        let goalNetWork = goalNetTotal; // formerly: Math.max(0, goalNetTotal - unearnedSum);

        // Goal Gross = Goal Net * (1 + TaxRate/100)
        // User requested additive formula: Net * (Tax + 100%)
        let goalGross = 0;
        if (goalNetWork !== Infinity) {
            goalGross = goalNetWork * (1 + (taxRate / 100));
        } else {
            goalGross = Infinity;
        }

        // Calculate Current Gross (Moved up)
        const currentNet = profile.currentNetIncome || 0;
        const currentGross = currentNet * (1 + (taxRate / 100));

        outputs.goalNet.textContent = Utils.formatCurrency(goalNetWork);
        outputs.goalGross.textContent = Utils.formatCurrency(goalGross);

        // Update Current Gross Output
        const outCurrentGross = document.getElementById('out-current-gross');
        if (outCurrentGross) {
            outCurrentGross.textContent = Utils.formatCurrency(currentGross);
        }

        // Save Calculated Goals for Calibrations
        profile.goals = {
            net: goalNetWork,
            gross: goalGross,
            current: currentGross
        };
        Store.saveIndependentProfile(profile);

        // 6. Fees Calculation

        // Helper to update table text
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = Utils.formatCurrency(val);
        };

        const hasBillableHours = totalBillableHours > 0;
        const pBillable = totalWorkHours > 0 ? (totalBillableHours / totalWorkHours) : 0;
        const weeksPerYear = weeks || 0; // Prevent div/0

        // Helper: Calculate Fees Set based on Gross Annual Goal/Current
        const calculateFees = (grossAmount, isGoal = false) => {
            if (weeksPerYear <= 0 || pBillable <= 0) {
                return { hourly: 0, daily: 0, weekly: 0, monthly: 0 };
            }

            // Step 1: Weekly Rate = (Gross - Unearned) / Weeks / %Billable
            const adjustedGross = Math.max(0, grossAmount - unearnedSum);
            const weekly = adjustedGross / weeksPerYear / pBillable;

            // Step 2: Derive others
            const monthly = weekly * weeksPerYear / 12;
            const daily = days > 0 ? (weekly / days) : 0;
            const hourly = hours > 0 ? (daily / hours) : 0;

            return { hourly, daily, weekly, monthly };
        };

        // --- GOAL FEES ---
        // Basis: Goal Gross Total (calculated above, which includes tax on the total goal)
        // Note: The formula essentially backs out the unearned income's influence on the rate here.
        const goalFees = calculateFees(goalGross, true);

        setVal('out-goal-hourly', goalFees.hourly);
        setVal('out-goal-daily', goalFees.daily);
        setVal('out-goal-weekly', goalFees.weekly);
        setVal('out-goal-monthly', goalFees.monthly);

        // --- NOW FEES ---
        // Basis: Current Net Income (Grossed Up) - Calculated above
        const nowFees = calculateFees(currentGross, false);

        setVal('out-now-hourly', nowFees.hourly);
        setVal('out-now-daily', nowFees.daily);
        setVal('out-now-weekly', nowFees.weekly);
        setVal('out-now-monthly', nowFees.monthly);
    }


    // 3. Initialization
    async function init() {
        profile = await Store.getIndependentProfile(); // Reload with latest

        // 2. State Management (Re-check defaults after async load)
        if (!profile.linesOfWork) profile.linesOfWork = [];
        if (!profile.expenses.items) {
            profile.expenses = {
                taxRate: 30,
                items: BASE_EXPENSE_CATEGORIES.map(item => ({
                    ...item,
                    id: crypto.randomUUID(),
                    amount: 0
                }))
            };
        }

        if (!profile.unearnedIncome || !profile.unearnedIncome.items) {
            profile.unearnedIncome = { items: [] }; // Minimal default, full default is large block above
            // Actually, merge defaults logic handles this in Store, but let's keep robust
        }

        if (profile.schedule) {
            inputs.weeks.value = profile.schedule.weeks;
            inputs.days.value = profile.schedule.days;
            inputs.hours.value = profile.schedule.hours;
        }

        if (profile.expenses.taxRate !== undefined) {
            inputs.taxRate.value = profile.expenses.taxRate;
        }

        const currentNetInput = document.getElementById('in-current-net-income');
        if (currentNetInput) {
            currentNetInput.value = profile.currentNetIncome || 0;
            currentNetInput.addEventListener('input', (e) => {
                profile.currentNetIncome = parseFloat(e.target.value) || 0;
                Store.saveIndependentProfile(profile);
            });
        }

        LineManager.render();
        ExpenseManager.render();
        IncomeManager.render();
        calculateAndDisplay();

        // Listeners for Global Inputs
        ['weeks', 'days', 'hours'].forEach(key => {
            inputs[key].addEventListener('input', (e) => {
                profile.schedule[key] = parseFloat(e.target.value);
                Store.saveIndependentProfile(profile);
                calculateAndDisplay();
            });
        });

        inputs.taxRate.addEventListener('input', (e) => {
            profile.expenses.taxRate = parseFloat(e.target.value);
            Store.saveIndependentProfile(profile);
            calculateAndDisplay();
        });
    }

    init();
});
