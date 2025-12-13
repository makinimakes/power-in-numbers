/**
 * Logic for Calibrations Dashboard
 * Enhanced with Flexible Periods and Detailed Contract Tracking
 */

// Wrapped in IIFE to prevent "already declared" errors
(function () {

    // UI References
    const inPeriodValue = document.getElementById('in-period-value');
    const inPeriodUnit = document.getElementById('in-period-unit');
    const btnMethodRate = document.getElementById('c-method');

    // Output Areas
    const confirmedList = document.getElementById('confirmed-list');
    const projectedList = document.getElementById('projected-list');

    // Updated IDs for New Layout
    const outTotalConfirmed = document.getElementById('out-total-confirmed-left');
    const outTotalProjected = document.getElementById('out-total-projected-left');

    // NOTE: These are now dynamic in calculateGapAnalysis, but kept here if needed/renamed to avoid null refs
    const outCapacityMsg = document.getElementById('out-capacity-msg');

    const modal = document.getElementById('modal-contract');

    // State
    let profile = {}; // Init empty
    let activeContractType = 'confirmed'; // 'confirmed' or 'projected'

    async function init() {
        // Wait for Supabase
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

        if (inPeriodValue) inPeriodValue.value = profile.calibrations.periodValue || 1;
        if (inPeriodUnit) inPeriodUnit.value = profile.calibrations.periodUnit || 'Years';

        renderContracts();
        calculateGap();

        // Listeners
        if (inPeriodValue) inPeriodValue.addEventListener('input', handlePeriodChange);
        if (inPeriodUnit) inPeriodUnit.addEventListener('change', handlePeriodChange);
        if (btnMethodRate) btnMethodRate.addEventListener('click', toggleMethod);
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
        modal.style.display = 'flex';

        const form = document.getElementById('form-contract');
        form.reset();

        // Set Hidden ID or Clear
        if (contractId) {
            // Edit Mode
            const list = activeContractType === 'confirmed' ? profile.calibrations.confirmed : profile.calibrations.projected;
            const contract = list.find(c => c.id === contractId);
            if (contract) {
                document.getElementById('contract-id').value = contract.id;
                document.getElementById('contract-name').value = contract.name;
                document.getElementById('contract-amount').value = contract.amount;
                document.getElementById('contract-hours').value = contract.hours;
                document.getElementById('contract-prob').value = contract.probability || 100;
            }
        } else {
            // Create Mode
            document.getElementById('contract-id').value = '';
        }
    }

    function closeContractModal() {
        modal.style.display = 'none';
    }


    async function saveContract() {
        const id = document.getElementById('contract-id').value || (window.Utils ? window.Utils.generateId() : 'fallback-' + Date.now());
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
        const list = type === 'confirmed' ? profile.calibrations.confirmed : profile.calibrations.projected;
        const idx = list.findIndex(c => c.id === id);
        if (idx >= 0) {
            list.splice(idx, 1);
            Store.saveIndependentProfile(profile);
            renderContracts();
            calculateGap();
        }
    }

    function renderContracts() {
        renderList(confirmedList, profile.calibrations.confirmed || [], 'confirmed');
        renderList(projectedList, profile.calibrations.projected || [], 'projected');
    }

    function renderList(container, list, type) {
        if (!container) return;
        container.innerHTML = '';

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
        if (!window.Utils) return; // Wait 

        // 1. Target (Goal)
        const totalNeeds = Utils.calculateTotalNeeds(profile.expenses);
        const taxRate = (profile.expenses.taxRate || 30) / 100;
        const annualGoal = totalNeeds / (1 - taxRate); // Gross Goal

        // Adjust for Period
        const periodVal = parseFloat(inPeriodValue.value) || 1;
        const periodUnit = inPeriodUnit.value;

        let yearFraction = 1;
        if (periodUnit === 'Months') yearFraction = periodVal / 12;
        else if (periodUnit === 'Weeks') yearFraction = periodVal / 52;
        else if (periodUnit === 'Years') yearFraction = periodVal;

        const periodTarget = annualGoal * yearFraction;

        const elTarget = document.getElementById('out-target');
        const elGap = document.getElementById('out-gap');
        const elRate = document.getElementById('out-rate');

        // 4. Total Income (Confirmed + Projected)
        const sumC = (profile.calibrations.confirmed || []).reduce((s, c) => s + c.amount, 0);
        const sumP = (profile.calibrations.projected || []).reduce((s, c) => s + c.amount, 0);
        const totalIncome = sumC + sumP;

        // 5. Gap
        const gap = periodTarget - totalIncome;

        // 6. Remaining Capacity (Shared)
        const capacity = Utils.calculateBillableCapacity(profile);
        const annualBillableHours = capacity.totalBillableHours;
        const periodGrossCapacity = annualBillableHours * yearFraction;

        const usedHoursC = (profile.calibrations.confirmed || []).reduce((s, c) => s + c.hours, 0);
        const usedHoursP = (profile.calibrations.projected || []).reduce((s, c) => s + c.hours, 0);
        const remainingCapacity = periodGrossCapacity - (usedHoursC + usedHoursP);

        // 7. Rate
        const requiredRate = (gap > 0 && remainingCapacity > 0) ? (gap / remainingCapacity) : 0;

        // Render
        if (elTarget) elTarget.textContent = Utils.formatCurrency(periodTarget);
        if (outTotalConfirmed) outTotalConfirmed.textContent = Utils.formatCurrency(sumC);
        if (outTotalProjected) outTotalProjected.textContent = Utils.formatCurrency(sumP);

        if (elGap) {
            elGap.textContent = Utils.formatCurrency(gap);
            elGap.style.color = gap > 0 ? 'var(--color-text-error)' : 'green';
        }
        if (elRate) elRate.textContent = Utils.formatCurrency(requiredRate) + '/hr';

        // Shared Capacity Message updates only once
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

})(); // End IIFE
