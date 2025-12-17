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
    let activeContractId = null; // Track ID for editing

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

        // Modal Listeners
        const elDensityFreq = document.getElementById('c-density-freq');
        if (elDensityFreq) elDensityFreq.addEventListener('change', updateOccurrenceUI);

        const elMethod = document.getElementById('c-method');
        if (elMethod) elMethod.addEventListener('change', toggleMethod);
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
        activeContractId = contractId; // Set active ID
        if (modal) modal.style.display = 'flex';

        // Reset Form
        document.getElementById('c-name').value = '';
        document.getElementById('c-method').value = 'rate';

        // Rate Defaults
        document.getElementById('c-rate').value = '';
        document.getElementById('c-rate-unit').value = 'Hour';
        document.getElementById('c-density-value').value = 1;
        document.getElementById('c-density-unit').value = 'Hours';
        document.getElementById('c-density-freq').value = 'Day';
        document.getElementById('c-duration').value = 1;
        document.getElementById('c-duration-unit').value = 'Years';

        // Flat Defaults
        document.getElementById('c-flat-amount').value = '';
        document.getElementById('c-flat-duration-val').value = 1;
        document.getElementById('c-flat-duration-unit').value = 'Months';

        toggleMethod(); // Ensure correct view

        if (contractId) {
            // Edit Mode: Populate from stored PARAMS
            const list = activeContractType === 'confirmed' ? profile.calibrations.confirmed : profile.calibrations.projected;
            const contract = list.find(c => c.id === contractId);
            if (contract && contract.params) {
                const p = contract.params;

                document.getElementById('c-name').value = contract.name || '';
                document.getElementById('c-method').value = p.method || 'rate';

                // Rate Params
                if (p.method === 'rate') {
                    if (p.rate) document.getElementById('c-rate').value = p.rate;
                    if (p.rateUnit) document.getElementById('c-rate-unit').value = p.rateUnit;
                    if (p.densityVal) document.getElementById('c-density-value').value = p.densityVal;
                    if (p.densityUnit) document.getElementById('c-density-unit').value = p.densityUnit;
                    if (p.densityFreq) document.getElementById('c-density-freq').value = p.densityFreq;
                    if (p.duration) document.getElementById('c-duration').value = p.duration;
                    if (p.durationUnit) document.getElementById('c-duration-unit').value = p.durationUnit;

                    // Occurrence Param
                    if (p.occurrenceVal) document.getElementById('c-occurrence-value').value = p.occurrenceVal;
                }

                // Flat Params
                if (p.method === 'flat') {
                    if (p.flatAmount) document.getElementById('c-flat-amount').value = p.flatAmount;
                    if (p.flatDurVal) document.getElementById('c-flat-duration-val').value = p.flatDurVal;
                    if (p.flatDurUnit) document.getElementById('c-flat-duration-unit').value = p.flatDurUnit;
                }

                toggleMethod(); // Refresh view based on loaded method
                updateOccurrenceUI(); // Refresh labels
            }
        }
    }

    function closeContractModal() {
        activeContractId = null;
        if (modal) modal.style.display = 'none';
    }

    async function saveContract() {
        const id = activeContractId || (window.Utils ? window.Utils.generateId() : 'c-' + Date.now());
        const name = document.getElementById('c-name').value || 'Untitled Contract';
        const method = document.getElementById('c-method').value;

        let totalAmount = 0;
        let totalHours = 0;
        let params = { method };

        if (method === 'rate') {
            // RATES LOGIC
            const rate = parseFloat(document.getElementById('c-rate').value) || 0;
            const rateUnit = document.getElementById('c-rate-unit').value;
            const densityVal = parseFloat(document.getElementById('c-density-value').value) || 0;
            const densityUnit = document.getElementById('c-density-unit').value;
            const densityFreq = document.getElementById('c-density-freq').value;
            const duration = parseFloat(document.getElementById('c-duration').value) || 0;
            const durationUnit = document.getElementById('c-duration-unit').value;

            // Occurrence
            const occurrenceVal = parseFloat(document.getElementById('c-occurrence-value').value) || 1;
            // Note: UI might hide it, but logic should handle "1" effectively if hidden? 
            // No, if hidden it means 100% or standard? 
            // Actually, if densityFreq is Year, and occurrence hidden, it means 1 per Year? 
            // Let's rely on the Algorithm.

            // Store Params
            params = { ...params, rate, rateUnit, densityVal, densityUnit, densityFreq, duration, durationUnit, occurrenceVal };

            // CALCULATION LOGIC 3.0 (Occurrence-Aware)

            // 1. Normalize Units to Hours for easy conversion
            const toHours = (unit) => {
                if (unit === 'Hour' || unit === 'Hours') return 1;
                if (unit === 'Day' || unit === 'Days') return 8; // Std assumption for conversion
                if (unit === 'Week' || unit === 'Weeks') return 40;
                if (unit === 'Month' || unit === 'Months') return 172;
                if (unit === 'Year' || unit === 'Years') return 2064;
                return 1;
            };

            // 2. Define Time Hierarchy (in Days) for Frequency / Duration Handling
            const toDays = (unit) => {
                if (unit === 'Day' || unit === 'Days') return 1;
                if (unit === 'Week' || unit === 'Weeks') return 7;
                if (unit === 'Month' || unit === 'Months') return 30.44;
                if (unit === 'Year' || unit === 'Years') return 365.25;
                return 1;
            };

            // 3. Determine Structure
            // Chain: DensityUnit PER DensityFreq PER OccurrenceFreq ... within Duration
            // We need to know what "OccurrenceFreq" is implied by the UI.

            // Logic mirrored from updateOccurrenceUI()
            let occurrenceFreqUnit = 'Week'; // default
            if (densityFreq === 'Day') occurrenceFreqUnit = 'Week';     // X Days per Week
            if (densityFreq === 'Week') occurrenceFreqUnit = 'Month';   // X Weeks per Month
            if (densityFreq === 'Month') occurrenceFreqUnit = 'Year';   // X Months per Year
            if (densityFreq === 'Year') occurrenceFreqUnit = 'Year';    // 1 Year per Year (No multiplier really)

            const durationDays = duration * toDays(durationUnit);
            const occurrenceFreqDays = toDays(occurrenceFreqUnit);

            // A. How many "OccurrenceFreqs" fit in the Duration?
            // e.g. Duration = 6 Weeks. OccFreq = Week. -> 6.
            // e.g. Duration = 1 Year. OccFreq = Month. -> 12.
            let totalOccurrencePeriods = durationDays / occurrenceFreqDays;

            // B. Special Case: If DensityFreq == Year, we usually don't scale by occurrence unless "Years per Decade"?
            // If DensityFreq is Year, Occurrence is hidden. Treat multiplier as 1 (handled by defaulting val/logic).
            if (densityFreq === 'Year') {
                totalOccurrencePeriods = duration * toDays(durationUnit) / toDays('Year'); // Just years in duration
                // And OccurrenceVal should be 1.
            }

            // C. Total Active "DensityFreqs"
            // e.g. 6 Weeks * 5 Days/Week = 30 Active Days.
            const totalActiveFreqs = totalOccurrencePeriods * occurrenceVal;

            // D. Total Active "DensityUnits"
            // e.g. 30 Days * 4 Hours/Day = 120 Active Hours.
            const totalActiveDensityUnits = totalActiveFreqs * densityVal;

            // E. Convert to Rate Unit
            // Need (DensityUnitHours / RateUnitHours)
            const conversionFactor = toHours(densityUnit) / toHours(rateUnit);

            const totalRateUnits = totalActiveDensityUnits * conversionFactor;

            totalAmount = rate * totalRateUnits;
            totalHours = totalActiveDensityUnits * toHours(densityUnit); // Capacity in Hours

        } else {
            // FLAT LOGIC
            const flatAmount = parseFloat(document.getElementById('c-flat-amount').value) || 0;
            const flatDurVal = parseFloat(document.getElementById('c-flat-duration-val').value) || 0;
            const flatDurUnit = document.getElementById('c-flat-duration-unit').value;

            params = { ...params, flatAmount, flatDurVal, flatDurUnit };

            totalAmount = flatAmount;

            // HOURS CALCULATION (Pro-rated Capacity)
            // User Expectation: "Calculated for the month... and deducted"
            // Assumption: Flat Fee covers "Standard Utilization" for that period.

            // 1. Get Annual Capacity
            const capacity = Utils.calculateBillableCapacity(profile);
            const annualBillable = capacity.totalBillableHours || 0;

            // 2. Get Duration Ratio based on User's Work Year
            // If user works 45 weeks/year, then 1 week of work = 1/45th of Annual Capacity.
            const workWeeksPerYear = (profile.schedule && profile.schedule.weeks) ? parseFloat(profile.schedule.weeks) : 52;

            let durRatio = 0;
            if (flatDurUnit === 'Weeks') durRatio = flatDurVal / workWeeksPerYear;
            if (flatDurUnit === 'Months') durRatio = flatDurVal / 12; // Annual / 12
            if (flatDurUnit === 'Years') durRatio = flatDurVal;

            // 3. Pro-rate
            totalHours = annualBillable * durRatio;
        }

        const contract = {
            id,
            name,
            amount: totalAmount,
            hours: totalHours,
            probability: 100, // Hardcoded for now in UI
            params
        };

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

        // Calculate Unearned Income Sum (Annual)
        let unearnedSum = 0;
        if (profile && profile.unearnedIncome && Array.isArray(profile.unearnedIncome.items)) {
            profile.unearnedIncome.items.forEach(item => {
                const amount = parseFloat(item.amount) || 0;
                const freq = parseFloat(item.frequency) || 1;
                // Logic from independent_fixed.js: 
                // Monthly=12, Periodic=*freq, Annual=1. 
                // Wait, item.type check needed.
                if (item.type === 'Monthly') unearnedSum += amount * 12;
                else if (item.type === 'Periodic') unearnedSum += amount * freq;
                else unearnedSum += amount; // Annual
            });
        }

        // --- NOW SCENARIO (Using Current Net Income as Target) ---
        // Safeguard Net Income
        const annualTargetNow = (profile && profile.currentNetIncome) ? parseFloat(profile.currentNetIncome) : 0;

        // Safeguard Tax Rate
        const rawTax = (profile && profile.expenses && profile.expenses.taxRate) ? profile.expenses.taxRate : 30;
        const taxRate = parseFloat(rawTax) / 100;

        // MATCH LOGIC: Additive Tax (Net * 1.Tax)
        const annualGrossTargetNow = annualTargetNow * (1 + taxRate);
        const periodTargetNow = annualGrossTargetNow * yearFraction;

        // Rate Calculation: (PeriodGross - PeriodUnearned) - ConfirmedIncome
        // Wait, "Rate" in independent.js is (AdjustedGross / Billable). "AdjustedGross" = Gross - Unearned.
        // Here we also subtract "Total Income" (Confirmed Contracts)?
        // Yes, Gap = Needs - Haves.
        // Needs = Target. Haves = Unearned + Confirmed + Projected.

        const periodUnearned = unearnedSum * yearFraction;
        const gapNow = periodTargetNow - periodUnearned - totalIncome;

        const requiredRateNow = (gapNow > 0 && remainingCapacity > 0) ? (gapNow / remainingCapacity) : 0;

        // --- GOAL SCENARIO (Using Calculated Expenses as Target) ---
        // Safeguard Total Needs with explicit sum
        let totalNeeds = 0;
        let expensesPercent = 0;
        if (profile && profile.expenses && Array.isArray(profile.expenses.items)) {
            profile.expenses.items.forEach(item => {
                const val = parseFloat(item.amount) || 0;
                if (item.type === 'Percent') expensesPercent += val;
                else if (item.type === 'Monthly') totalNeeds += val * 12;
                else if (item.type === 'Periodic') totalNeeds += val * (item.frequency || 1);
                else totalNeeds += val;
            });
        }

        // Goal Net = Fixed / (1 - Percent)
        let goalNet = totalNeeds;
        if (expensesPercent < 100) {
            goalNet = totalNeeds / (1 - (expensesPercent / 100));
        }

        // Goal Gross = Goal Net * (1 + Tax) (Additive)
        const annualGrossTargetGoal = goalNet * (1 + taxRate);
        const periodTargetGoal = annualGrossTargetGoal * yearFraction;

        const gapGoal = periodTargetGoal - periodUnearned - totalIncome;
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
        const val = document.getElementById('c-method').value;
        const rateDiv = document.getElementById('method-rate');
        const flatDiv = document.getElementById('method-flat');

        if (val === 'rate') {
            rateDiv.style.display = 'block';
            flatDiv.style.display = 'none';
        } else {
            rateDiv.style.display = 'none';
            flatDiv.style.display = 'block';
        }
    }
    window.toggleMethod = toggleMethod;

    function updateOccurrenceUI() {
        const freq = document.getElementById('c-density-freq').value;
        const row = document.getElementById('row-occurrence');
        const label = document.getElementById('c-occurrence-label');
        const input = document.getElementById('c-occurrence-value');

        if (!row) return;

        // Logic:
        // Day -> Occurs X Days per Week?
        // Week -> Occurs X Weeks per Month?
        // Month -> Occurs X Months per Year?
        // Year -> N/A (Assume 1)

        if (freq === 'Day') {
            row.style.display = 'flex';
            label.textContent = 'Days per Week';
            if (!input.value) input.value = 5;
        } else if (freq === 'Week') {
            row.style.display = 'flex';
            label.textContent = 'Weeks per Month'; // Ambiguous w/ 4.3, but standard user input is 4 or 4.3
            if (!input.value) input.value = 4;
        } else if (freq === 'Month') {
            row.style.display = 'flex';
            label.textContent = 'Months per Year';
            if (!input.value) input.value = 12;
        } else {
            row.style.display = 'none';
            input.value = 1;
        }
    }
    window.updateOccurrenceUI = updateOccurrenceUI;

    // START
    init();

})(); // End IIF
