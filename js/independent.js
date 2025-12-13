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
    let overheadProjects = []; // Business Personalities

    const BASE_EXPENSE_CATEGORIES = [
        { label: 'Housing (Rent/Mortgage)', type: 'Monthly' },
        { label: 'Utilities & Internet', type: 'Monthly' },
        { label: 'Groceries & Household', type: 'Monthly' },
        { label: 'Healthcare / Insurance', type: 'Monthly' },
        { label: 'Transportation', type: 'Monthly' },
        { label: 'Savings / Investments', type: 'Percent' },
        { label: 'Debt Repayment', type: 'Monthly' },
        { label: 'Entertainment / Leisure', type: 'Monthly' },
        { label: 'Other', type: 'Monthly' }
    ];

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
    // BUSINESS PROFILE MANAGER (Overhead)
    // -------------------------------------------------------------------------
    const BusinessProfileManager = {
        container: document.getElementById('overhead-profiles-container'),

        render: () => {
            if (!BusinessProfileManager.container) return;
            BusinessProfileManager.container.innerHTML = '';

            if (overheadProjects.length === 0) {
                BusinessProfileManager.container.innerHTML = '<div style="font-style:italic; color:#666; font-size:0.9rem;">No business profiles yet. Create one to account for overhead.</div>';
                return;
            }

            overheadProjects.forEach((proj, index) => {
                const row = document.createElement('div');
                row.className = 'ledger-row';
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.marginBottom = '10px';
                row.style.background = '#fff';
                row.style.padding = '8px';
                row.style.border = '1px solid #eee';

                const totalExp = (proj.expenses || []).reduce((acc, item) => acc + (parseFloat(item.amount || 0)), 0);

                row.innerHTML = `
                    <div style="flex-grow:1;">
                        <input type="text" value="${proj.name}" 
                            onchange="BusinessProfileManager.update(${index}, 'name', this.value)"
                            style="font-weight:bold; width:100%; border:none; background:transparent;">
                        <div style="font-size:0.8rem; color:#666;">
                            Total Overhead: <strong>$${totalExp.toLocaleString()}</strong> 
                            <button onclick="BusinessProfileManager.editExpenses('${proj.id}')" style="text-decoration:underline; border:none; background:none; cursor:pointer; color:var(--color-primary);">Edit Expenses</button>
                        </div>
                    </div>
                    <button onclick="BusinessProfileManager.remove(${index})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
                `;
                BusinessProfileManager.container.appendChild(row);
            });
        },

        create: async () => {
            const name = prompt("Enter Business Name (e.g. Makini Makes):");
            if (!name) return;
            try {
                const newProj = await Store.createOverheadProject(name);
                if (newProj) {
                    overheadProjects.push(newProj);
                    BusinessProfileManager.render();
                    renderLinesOfWork(); // Update dropdowns
                }
            } catch (e) { alert(e.message); }
        },

        update: async (index, field, value) => {
            overheadProjects[index][field] = value;
            try {
                await Store.saveOverheadProject(overheadProjects[index]);
            } catch (e) { console.error(e); }
        },

        remove: async (index) => {
            if (!confirm("Delete this business profile?")) return;
            // TODO: Delete from DB? Store relies on user owner_id.
            // For now, no delete method in Store for Projects exposed yet.
            // We can add a 'deleted' flag or actually delete.
            // Assuming we just strip it from view for MVP or impl deleteProject in Store.
            // "saveOverheadProject" updates data, doesn't delete row.
            // Let's implement deleteProject later if needed, or assume Store.saveProject handles state?
            // "saveOverheadProject" updates data, doesn't delete row.
            alert("Deletion not fully supported in this draft. (Contact support to remove DB row)");
        },

        editExpenses: (id) => {
            // Primitive Edit: Prompt for Total Overhead Override?
            // User requested "en masse" list.
            // We need a modal or section to edit the expenses of THIS project.
            // We can temporarily swap the ExpenseManager to edit THIS project? No, confusing.
            // Let's fallback to a prompt for TOTAL Amount for this MVP iteration?
            // "These overhead personalities will not need to account for... separate phases... just non-wage expenses."

            // Allow setting a single "Total Overhead" amount for simplicity first?
            const proj = overheadProjects.find(p => p.id === id);
            if (!proj) return;

            // Simple approach: One Expense Item named "Annual Overhead"
            let currentAmount = 0;
            if (proj.expenses && proj.expenses.length > 0) {
                currentAmount = proj.expenses[0].amount;
            }

            const newAmount = prompt(`Enter Total Annual Overhead for ${proj.name}:`, currentAmount);
            if (newAmount !== null) {
                const val = parseFloat(newAmount) || 0;
                proj.expenses = [{ label: "Annual Overhead", amount: val, type: "Annual" }]; // Overwrite with single item
                Store.saveOverheadProject(proj);
                BusinessProfileManager.render();
                calculateAndDisplay();
            }
        }
    };
    window.BusinessProfileManager = BusinessProfileManager;

    // -------------------------------------------------------------------------
    // LINE ITEMS (Work)
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

                // Build options for overhead projects dropdown
                const overheadOptions = overheadProjects.map(proj =>
                    `<option value="${proj.id}" ${line.overheadProjectId === proj.id ? 'selected' : ''}>${proj.name}</option>`
                ).join('');

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

                // Overhead Project Selector
                const overheadSelectorDiv = document.createElement('div');
                overheadSelectorDiv.style.marginBottom = 'var(--spacing-sm)';

                // Calculate Rate if linked
                let rateDisplay = '';
                let computedOverheadRate = 0;

                if (line.overheadProjectId) {
                    const linkedProj = overheadProjects.find(p => p.id === line.overheadProjectId);
                    if (linkedProj) {
                        const totalOverhead = (linkedProj.expenses || []).reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);

                        // Calculate Line Hours
                        // Assume line duration is in Weeks for simplicity or convert.
                        // Logic mirrors global calc: weeks * hours_per_week
                        let lineWeeks = parseFloat(line.duration.value) || 0;
                        if (line.duration.unit === 'Months') lineWeeks *= 4.33;
                        if (line.duration.unit === 'Years') lineWeeks *= 52;

                        const weeklyHours = (line.activities || []).reduce((sum, act) => sum + (parseFloat(act.amount) || 0), 0);
                        const totalLineHours = lineWeeks * weeklyHours;

                        computedOverheadRate = BudgetEngine.calculateOverheadRate(totalOverhead, totalLineHours);

                        // Save to line object for persistence (so Project Tool can read it)
                        line.derivedOverheadRate = computedOverheadRate;

                        // Formatting
                        if (totalLineHours > 0) {
                            rateDisplay = `<div style="margin-top:5px; font-size:0.8rem; color:var(--color-primary); font-weight:bold; background:var(--color-bg-subtle); padding:5px; border-radius:4px;">
                                Linked Overhead Rate: $${computedOverheadRate.toFixed(2)}/hr
                                <span style="font-weight:normal; color:#666;">(${linkedProj.name}: $${totalOverhead.toLocaleString()} / ${Math.round(totalLineHours)} hrs)</span>
                            </div>`;
                        } else {
                            rateDisplay = `<div style="margin-top:5px; font-size:0.8rem; color:red;">Add activities to calculate rate.</div>`;
                        }
                    }
                } else {
                    line.derivedOverheadRate = 0;
                }

                overheadSelectorDiv.innerHTML = `
                    <label style="font-size:0.6rem;">Associated Business Profile (Overhead)</label>
                    <select onchange="updateLine(${lineIndex}, 'overheadProjectId', this.value)" style="width:100%; margin-bottom:5px;">
                        <option value="">None</option>
                        ${overheadOptions}
                    </select>
                    ${rateDisplay}
                `;
                card.appendChild(overheadSelectorDiv);

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

            // Add "New Line" button at the bottom if there are any lines
            if (profile.linesOfWork.length > 0) {
                const bottomBtn = document.createElement('button');
                bottomBtn.innerText = "+ New Line";
                bottomBtn.style.fontSize = "0.8rem";
                bottomBtn.style.padding = "5px 10px";
                bottomBtn.style.marginTop = "10px";
                bottomBtn.style.cursor = "pointer";
                bottomBtn.style.width = "100%";
                bottomBtn.style.border = "1px dashed #ccc";
                bottomBtn.style.background = "#fafafa";

                bottomBtn.onclick = () => LineManager.addLine();
                LineManager.container.appendChild(bottomBtn);
            }
        },

        addLine: () => {
            profile.linesOfWork.push({
                id: crypto.randomUUID(),
                label: 'New Line of Work',
                duration: { value: 52, unit: 'Weeks' },
                activities: [],
                overheadProjectId: '' // New field
            });
            renderLinesOfWork();
            calculateAndDisplay();
            Store.saveIndependentProfile(profile);
        },

        removeLine: (index) => {
            if (confirm('Delete this line of work?')) {
                profile.linesOfWork.splice(index, 1);
                renderLinesOfWork();
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
            if (subField === 'unit') renderLinesOfWork();
        },

        confirmOverride: () => {
            if (LineManager.pendingOverride) {
                const { index, subField, value } = LineManager.pendingOverride;
                profile.linesOfWork[index].duration[subField] = value;
                calculateAndDisplay();
                Store.saveIndependentProfile(profile);
                if (subField === 'unit') renderLinesOfWork();
                LineManager.pendingOverride = null;
            }
            document.getElementById('modal-override').close();
        },

        cancelOverride: () => {
            LineManager.pendingOverride = null;
            document.getElementById('modal-override').close();
            // Revert UI to previous state by re-rendering
            renderLinesOfWork();
        },

        // Activity Methods
        addActivity: (lineIndex) => {
            profile.linesOfWork[lineIndex].activities.push({
                label: '',
                amount: 0,
                unit: 'Hours',
                frequency: 'Per Week'
            });
            renderLinesOfWork();
            // Dont save yet, wait for edits
            Store.saveIndependentProfile(profile);
        },

        removeActivity: (lineIndex, actIndex) => {
            profile.linesOfWork[lineIndex].activities.splice(actIndex, 1);
            renderLinesOfWork();
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

    // Rename LineManager.render to renderLinesOfWork
    const renderLinesOfWork = LineManager.render;

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
    document.getElementById('btn-add-overhead-profile').onclick = BusinessProfileManager.create;


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

        // Add Overhead Project Expenses
        overheadProjects.forEach(proj => {
            if (proj.expenses) {
                proj.expenses.forEach(item => {
                    const amount = parseFloat(item.amount) || 0;
                    if (item.type === 'Annual') { // Assuming overhead project expenses are annual
                        fixedSum += amount;
                    }
                });
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

        // Calculate breakdown for logs
        let monthlySum = 0;
        let periodicSum = 0;
        let percentSumLog = 0;
        profile.expenses.items.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            if (item.type === 'Monthly') monthlySum += amount;
            if (item.type === 'Periodic') periodicSum += (amount * (item.frequency || 1));
            if (item.type === 'Percent') percentSumLog += amount;
        });

        // Helper aliases
        const schedule = profile.schedule;
        const totalBillable = totalBillableHours; // from scope above
        const formatNumber = Utils.formatNumber;
        const formatCurrency = Utils.formatCurrency;
        const taxRateVal = taxRate;

        // Build Goal Net Log dynamically
        const goalNetLog = [
            { formula: "Sum of Expenses (Monthly Items)", value: monthlySum * 12 },
            { formula: "Sum of Expenses (Periodic Items)", value: periodicSum },
            { formula: "Total Fixed Expenses", value: (monthlySum * 12) + periodicSum }
        ];

        if (percentSumLog > 0) {
            goalNetLog.push({ formula: `Plus Percent Adjustments (Savings/Profit)`, value: `${percentSumLog}%`, formatter: 'none' });
            goalNetLog.push({ formula: `Formula: Fixed Expenses / (1 - ${percentSumLog}%)`, value: `1 / ${formatNumber(1 - (percentSumLog / 100))}`, formatter: 'none' });
        }

        goalNetLog.push({ formula: "Goal Net Income", value: goalNetWork });

        // Populate Math Logs
        try {
            window._mathLogs = {
                goalNet: goalNetLog,
                currentGross: [
                    { formula: "Current Net Income (Input)", value: currentNet },
                    { formula: `Gross Up Factor: 1 / (1 - ${formatNumber(taxRateVal)}%)`, value: 1 / ((100 - taxRateVal) / 100) },
                    { formula: `Current Gross = ${formatCurrency(currentNet)} / ${formatNumber((100 - taxRateVal) / 100)}`, value: currentGross }
                ],
                goalGross: [
                    { formula: "Goal Net Income (After Tax)", value: goalNetWork },
                    { formula: `Gross Up Factor: 1 / (1 - ${formatNumber(taxRateVal)}%)`, value: 1 / ((100 - taxRateVal) / 100) },
                    { formula: `Goal Gross = ${formatCurrency(goalNetWork)} / ${formatNumber((100 - taxRateVal) / 100)}`, value: goalGross }
                ],
                // NOW Fees
                nowHourly: [
                    { formula: "Current Gross Income", value: currentGross },
                    { formula: `Total Billable Hours (Total Capacity - Non-Billable)`, value: totalBillable, formatter: 'number' },
                    { formula: "Hourly Rate = Gross / Total Billable Hours", value: nowFees.hourly }
                ],
                nowDaily: [
                    { formula: "Hourly Rate", value: nowFees.hourly },
                    { formula: `Hours per Day`, value: schedule.hours, formatter: 'number' },
                    { formula: "Daily Rate = Hourly * Hours/Day", value: nowFees.daily }
                ],
                nowWeekly: [
                    { formula: "Daily Rate", value: nowFees.daily },
                    { formula: `Work Days per Week`, value: schedule.days, formatter: 'number' },
                    { formula: "Weekly Rate = Daily * Days/Week", value: nowFees.weekly }
                ],
                nowMonthly: [
                    { formula: "Weekly Rate", value: nowFees.weekly },
                    { formula: "Weeks per Year", value: schedule.weeks, formatter: 'number' },
                    { formula: "Monthly Rate = (Weekly * Weeks) / 12", value: nowFees.monthly }
                ],
                // GOAL Fees
                goalHourly: [
                    { formula: "Goal Gross Income", value: goalGross },
                    { formula: `Total Billable Hours (Total Capacity - Non-Billable)`, value: totalBillable, formatter: 'number' },
                    { formula: "Hourly Rate = Gross / Total Billable Hours", value: goalFees.hourly }
                ],
                goalDaily: [
                    { formula: "Hourly Rate", value: goalFees.hourly },
                    { formula: `Hours per Day`, value: schedule.hours, formatter: 'number' },
                    { formula: "Daily Rate = Hourly * Hours/Day", value: goalFees.daily }
                ],
                goalWeekly: [
                    { formula: "Daily Rate", value: goalFees.daily },
                    { formula: `Work Days per Week`, value: schedule.days, formatter: 'number' },
                    { formula: "Weekly Rate = Daily * Days/Week", value: goalFees.weekly }
                ],
                goalMonthly: [
                    { formula: "Weekly Rate", value: goalFees.weekly },
                    { formula: "Weeks per Year", value: schedule.weeks, formatter: 'number' },
                    { formula: "Monthly Rate = (Weekly * Weeks) / 12", value: goalFees.monthly }
                ]
            };
        } catch (e) {
            console.error("Math Log Logic Error:", e);
            // alert("Debug Error in Math Logs: " + e.message); // Commented out to avoid spamming if loop, but user needs to see it.
            // Actually, calculateAndDisplay is called often. Alerting might spam. 
            // Better to alert ONLY if _mathLogs is missing when VIEWING?
            // No, user can't see console.
            // I'll put a one-time error flag on window.
            if (!window._hasAlertedMathError) {
                // alert("System Alert: Math Log Calculation Failed: " + e.message);
                window._hasAlertedMathError = true;
                window._lastMathError = e.message;
            }
        }

    }

    // New Helper: View Math Log
    window.viewIndependentLog = (key) => {
        const modal = document.getElementById('modal-math-log');
        const content = document.getElementById('math-log-content');

        if (!modal || !content) return;

        const logs = window._mathLogs ? window._mathLogs[key] : [];
        content.innerHTML = '';

        if (!logs || logs.length === 0) {
            let msg = '<p>No calculation details available.</p>';
            if (window._lastMathError) {
                msg += `<p style="color:red; font-size:0.8rem; margin-top:10px;">Debug Error: ${window._lastMathError}</p>`;
            }
            content.innerHTML = msg;
        } else {
            logs.forEach(log => {
                const div = document.createElement('div');
                div.style.marginBottom = '10px';
                div.style.borderBottom = '1px solid #eee';
                div.style.paddingBottom = '5px';

                let displayValue;
                if (log.formatter === 'number') {
                    displayValue = Utils.formatNumber(log.value);
                } else if (log.formatter === 'none') {
                    displayValue = log.value;
                } else {
                    displayValue = Utils.formatCurrency(log.value);
                }

                div.innerHTML = `
                    <div style="color:#555; font-size:0.85rem;">${log.formula}</div>
                    <div style="font-weight:bold; text-align:right;">${displayValue}</div>
                `;
                content.appendChild(div);
            });
        }

        modal.style.display = 'flex';
    };

    // Helper to render global inputs and attach listeners
    function renderInputs() {
        // Schedule Inputs
        if (!profile.schedule) profile.schedule = {};
        inputs.weeks.value = profile.schedule.weeks || 0;
        inputs.days.value = profile.schedule.days || 0;
        inputs.hours.value = profile.schedule.hours || 0;

        // Tax Rate Input
        if (!profile.expenses) profile.expenses = {};
        inputs.taxRate.value = profile.expenses.taxRate !== undefined ? profile.expenses.taxRate : 30; // Default tax rate

        // Current Net Income Input
        const currentNetInput = document.getElementById('in-current-net-income');
        if (currentNetInput) {
            currentNetInput.value = profile.currentNetIncome || 0;
            currentNetInput.addEventListener('input', (e) => {
                profile.currentNetIncome = parseFloat(e.target.value) || 0;
                Store.saveIndependentProfile(profile);
                calculateAndDisplay();
            });
        }

        // Listeners for Global Inputs
        ['weeks', 'days', 'hours'].forEach(key => {
            inputs[key].addEventListener('input', (e) => {
                profile.schedule[key] = parseFloat(e.target.value);
                Store.saveIndependentProfile(profile);
                calculateAndDisplay();
                renderLinesOfWork(); // Re-render lines of work to update activity hours
            });
        });

        inputs.taxRate.addEventListener('input', (e) => {
            profile.expenses.taxRate = parseFloat(e.target.value);
            Store.saveIndependentProfile(profile);
            calculateAndDisplay();
        });
    }

    // 3. Initialization
    async function init() {
        try {
            // 1. Load Profile
            try {
                profile = await Store.getIndependentProfile();
            } catch (e) {
                console.error("Profile Load Error:", e);
                // Fallback to empty if load fails? Or alert?
                // profile = {}; 
                // We should probably alert.
            }

            // 2. Load Overhead Projects
            try {
                overheadProjects = await Store.getOverheadProjects();
                if (!Array.isArray(overheadProjects)) overheadProjects = [];
            } catch (e) {
                console.error("Overhead Load Error:", e);
                overheadProjects = [];
            }

            // 3. Defaults
            if (!profile) profile = {}; // Safety
            if (!profile.linesOfWork) profile.linesOfWork = [];

            // Ensure expenses object exists
            if (!profile.expenses) profile.expenses = {};

            // Ensure items array exists (even if taxRate exists)
            if (!profile.expenses.items) {
                profile.expenses.items = BASE_EXPENSE_CATEGORIES.map(item => ({
                    id: crypto.randomUUID(),
                    ...item,
                    amount: 0
                }));
                // Default tax if missing
                if (profile.expenses.taxRate === undefined) profile.expenses.taxRate = 30;
            }


            if (!profile.unearnedIncome || !profile.unearnedIncome.items) {
                profile.unearnedIncome = { items: [] };
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
            BusinessProfileManager.render(); // Ensure Personalities are rendered
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
