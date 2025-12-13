/**
 * Logic for Calibrations Dashboard
 * Enhanced with Dual-Column (Now vs Goal) Analysis
 */

// Wrapped in IIFE to prevent "already declared" errors
(function () {

    // UI References
    const inPeriodValue = document.getElementById('in-period-value');
    const inPeriodUnit = document.getElementById('in-period-unit');
    // const btnMethodRate = document.getElementById('c-method'); // Found in modal, handled there

    // Output Areas - Confirmed/Projected Lists
    const confirmedList = document.getElementById('confirmed-list');
    const projectedList = document.getElementById('projected-list');

    // Output Areas - Totals
    const outTotalConfirmed = document.getElementById('out-total-confirmed-left');
    const outTotalProjected = document.getElementById('out-total-projected-left');

    // Output Areas - Capacity
    const outCapacityMsg = document.getElementById('out-capacity-msg');

    const modal = document.getElementById('modal-contract');

    // State
    let profile = {}; // Init empty
    let activeContractType = 'confirmed'; // 'confirmed' or 'projected'

    async function init() {
        // Wait for Supabase/Store
        if (!window.Store) {
            console.warn("Store not ready for calibrations. Let's wait...");
            setTimeout(init, 500);
            return;
        }

        profile = await Store.getIndependentProfile();

        // Load Period State
        if (!profile.calibrations) {
            profile.calibrations = {
                periodValue: 1,
                periodUnit: 'Years',
                confirmed: [],
                projected: []
            };
            Store.saveIndependentProfile(profile);
        }

        // Init Inputs
        if (inPeriodValue) inPeriodValue.value = profile.calibrations.periodValue || 1;
        if (inPeriodUnit) inPeriodUnit.value = profile.calibrations.periodUnit || 'Years';

        renderContracts();
        calculateGap();

        // Listeners
        if (inPeriodValue) inPeriodValue.addEventListener('input', handlePeriodChange);
        if (inPeriodUnit) inPeriodUnit.addEventListener('change', handlePeriodChange);
    }

    function handlePeriodChange() {
        const val = parseFloat(inPeriodValue.value) || 1;
        const unit = inPeriodUnit.value;

        profile.calibrations.periodValue = val;
        profile.calibrations.periodUnit = unit;
        Store.saveIndependentProfile(profile);

        calculateGap();
    }

    function openContractModal(type, contractId = null) {
        activeContractType = type;
        if (modal) modal.style.display = 'flex';

        const form = document.getElementById('form-contract');
        if (form) form.reset();

        // Set Hidden ID or Clear
        const elId = document.getElementById('contract-id');
        const elName = document.getElementById('contract-name');
        const elAmount = document.getElementById('contract-amount');
        const elHours = document.getElementById('contract-hours');
        const elProb = document.getElementById('contract-prob');

        if (contractId) {
            // Edit Mode
            const list = activeContractType === 'confirmed' ? profile.calibrations.confirmed : profile.calibrations.projected;
            const contract = list.find(c => c.id === contractId);
            if (contract) {
                if (elId) elId.value = contract.id;
                if (elName) elName.value = contract.name;
                if (elAmount) elAmount.value = contract.amount;
                if (elHours) elHours.value = contract.hours;
                if (elProb) elProb.value = contract.probability || 100;
            }
        } else {
            // Create Mode
            if (elId) elId.value = '';
        }
    }

    function closeContractModal() {
        if (modal) modal.style.display = 'none';
    }


    async function saveContract() {
        const idInput = document.getElementById('contract-id');
        const id = (idInput && idInput.value) ? idInput.value : (window.Utils ? window.Utils.generateId() : 'fallback-' + Date.now());

        const name = document.getElementById('contract-name').value;
        const amount = parseFloat(document.getElementById('contract-amount').value) || 0;
        const hours = parseFloat(document.getElementById('contract-hours').value) || 0;
        const prob = parseFloat(document.getElementById('contract-prob').value) || 100;

        const contract = { id, name, amount, hours, probability: prob };

        if (!profile.calibrations) profile.calibrations = { confirmed: [], projected: [] };
        if (!profile.calibrations.confirmed) profile.calibrations.confirmed = [];
        if (!profile.calibrations.projected) profile.calibrations.projected = [];

        const list = activeContractType === 'confirmed' ? profile.calibrations.confirmed : profile.calibrations.projected;

        const idx = list.findIndex(c => c.id === id);
        if (idx >= 0) {
            list[idx] = contract;
        } else {
            list.push(contract);
        }

        await Store.saveIndependentProfile(profile);
        closeContractModal();
        renderContracts();
        calculateGap();
    }

    function removeContract(id, type) {
        if (!profile.calibrations) return;
        const list = type === 'confirmed' ? profile.calibrations.confirmed : profile.calibrations.projected;
        if (!list) return;

        const idx = list.findIndex(c => c.id === id);
        if (idx >= 0) {
            list.splice(idx, 1);
            Store.saveIndependentProfile(profile);
            renderContracts();
            calculateGap();
        }
    }

    function renderContracts() {
        renderList(confirmedList, profile.calibrations ? profile.calibrations.confirmed : [], 'confirmed');
        renderList(projectedList, profile.calibrations ? profile.calibrations.projected : [], 'projected');
    }

    function renderList(container, list, type) {
        if (!container) return;
        container.innerHTML = '';
        if (!list) return;

        list.forEach(c => {
            const div = document.createElement('div');
            div.className = 'contract-card';
            div.innerHTML = `
                <div>
                    <strong>${c.name}</strong><br>
                    ${window.Utils ? window.Utils.formatCurrency(c.amount) : c.amount} | ${c.hours} hrs
                    ${type === 'projected' ? `<br><small>${c.probability}% prob</small>` : ''}
                </div>
                <div>
                    <button onclick="openContractModal('${type}', '${c.id}')">Edit</button>
                    <button onclick="removeContract('${c.id}', '${type}')">X</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function calculateGap() {
        if (!window.Utils || !profile) return;

        // 1. Determine Fraction (Year Fraction)
        const periodVal = parseFloat(inPeriodValue.value) || 1;
        const periodUnit = inPeriodUnit.value;
        let yearFraction = 1;
        if (periodUnit === 'Months') yearFraction = periodVal / 12;
        else if (periodUnit === 'Weeks') yearFraction = periodVal / 52;
        else if (periodUnit === 'Years') yearFraction = periodVal;

        const labelPeriod = `${periodVal} ${periodUnit}`;

        // 2. Capacity Common Vars
        const capacity = Utils.calculateBillableCapacity(profile);
        const annualBillableHours = capacity.totalBillableHours;
        const periodGrossCapacity = annualBillableHours * yearFraction; // Capacity for this period

        // 3. Contract Usage (Confirmed + Projected)
        const usedHoursC = (profile.calibrations && profile.calibrations.confirmed) ? profile.calibrations.confirmed.reduce((s, c) => s + c.hours, 0) : 0;
        const usedHoursP = (profile.calibrations && profile.calibrations.projected) ? profile.calibrations.projected.reduce((s, c) => s + c.hours, 0) : 0;
        const remainingCapacity = periodGrossCapacity - (usedHoursC + usedHoursP);

        // 4. Income Totals
        const sumC = (profile.calibrations && profile.calibrations.confirmed) ? profile.calibrations.confirmed.reduce((s, c) => s + c.amount, 0) : 0;
        const sumP = (profile.calibrations && profile.calibrations.projected) ? profile.calibrations.projected.reduce((s, c) => s + c.amount, 0) : 0;
        const totalIncome = sumC + sumP;

        // --- NOW SCENARIO (Using Current Net Income as Target) ---
        // "Now" = How we are tracking against what we CURRENTLY make (or user-defined current baseline).
        // If currentNetIncome is 0, use expenses logic as fallback? No, use 0.
        const annualTargetNow = profile.currentNetIncome || 0;
        // Note: Independent Tool usually grosses this up? "Current Net" -> "Current Gross"?
        // Let's assume currentNetIncome is NET, so we Gross It Up.
        const taxRate = (profile.expenses.taxRate || 30) / 100;
        const annualGrossTargetNow = annualTargetNow / (1 - taxRate);
        const periodTargetNow = annualGrossTargetNow * yearFraction;

        const gapNow = periodTargetNow - totalIncome;
        const requiredRateNow = (gapNow > 0 && remainingCapacity > 0) ? (gapNow / remainingCapacity) : 0;

        // --- GOAL SCENARIO (Using Calculated Expenses as Target) ---
        const totalNeeds = Utils.calculateTotalNeeds(profile.expenses);
        const annualGrossTargetGoal = totalNeeds / (1 - taxRate);
        const periodTargetGoal = annualGrossTargetGoal * yearFraction;

        const gapGoal = periodTargetGoal - totalIncome;
        const requiredRateGoal = (gapGoal > 0 && remainingCapacity > 0) ? (gapGoal / remainingCapacity) : 0;

        // --- RENDER ---

        // Header Labels
        const elLabelNow = document.getElementById('out-period-label-now');
        if (elLabelNow) elLabelNow.textContent = labelPeriod;

        const elLabelGoal = document.getElementById('out-period-label-goal');
        if (elLabelGoal) elLabelGoal.textContent = labelPeriod;

        // NOW Outputs
        const elTargetNow = document.getElementById('out-period-target-now');
        if (elTargetNow) elTargetNow.textContent = Utils.formatCurrency(periodTargetNow);

        const elGapNow = document.getElementById('out-gap-now');
        if (elGapNow) {
            elGapNow.textContent = Utils.formatCurrency(gapNow);
            elGapNow.style.color = gapNow > 0 ? 'var(--color-text-error)' : 'green';
        }

        const elRateNow = document.getElementById('out-required-rate-now');
        if (elRateNow) elRateNow.textContent = Utils.formatCurrency(requiredRateNow) + '/hr';

        // GOAL Outputs
        const elTargetGoal = document.getElementById('out-period-target-goal');
        if (elTargetGoal) elTargetGoal.textContent = Utils.formatCurrency(periodTargetGoal);

        const elGapGoal = document.getElementById('out-gap-goal');
        if (elGapGoal) {
            elGapGoal.textContent = Utils.formatCurrency(gapGoal);
            elGapGoal.style.color = gapGoal > 0 ? 'var(--color-text-error)' : 'green';
        }

        const elRateGoal = document.getElementById('out-required-rate-goal');
        if (elRateGoal) elRateGoal.textContent = Utils.formatCurrency(requiredRateGoal) + '/hr';

        // Shared Outputs
        if (outTotalConfirmed) outTotalConfirmed.textContent = Utils.formatCurrency(sumC);
        if (outTotalProjected) outTotalProjected.textContent = Utils.formatCurrency(sumP);

        if (outCapacityMsg) {
            outCapacityMsg.textContent = `${Math.round(remainingCapacity)} billable hours remaining (of ${Math.round(periodGrossCapacity)} total)`;
        }
    }

    // Global exposure
    window.openContractModal = openContractModal;
    window.closeContractModal = closeContractModal;
    window.saveContract = saveContract;
    window.removeContract = removeContract;
    window.handlePeriodChange = handlePeriodChange;

    function toggleMethod() {
        console.log("Toggle Method clicked");
    }
    window.toggleMethod = toggleMethod;

    // START
    init();

})(); // End IIF
