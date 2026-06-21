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
        window.overheadProjects = await Store.getOverheadProjects();

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

        if (inPeriodUnit) inPeriodUnit.value = profile.calibrations.periodUnit || 'Years';

        renderContracts();

        // Handle URL Routing from Global Search
        setTimeout(() => {
            const params = new URLSearchParams(window.location.search);
            const editIdx = params.get('edit');
            if (editIdx !== null) {
                if (window.openCatalogModal) {
                    window.openCatalogModal(parseInt(editIdx));
                }
            }
        }, 500);

        renderCatalogList();
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
        let oldHours = 0;
        if (idx >= 0) {
            oldHours = list[idx].hours || 0;
        }

        const deltaHours = totalHours - oldHours;
        const currentRemaining = window.getRemainingCapacity(profile);
        if (deltaHours > currentRemaining) {
            const confirmed = confirm(`Warning: This project requires ${deltaHours.toFixed(1)} additional hours, but you only have ${currentRemaining.toFixed(1)} hours of capacity remaining for this period. Do you want to proceed and overbook yourself?`);
            if (!confirmed) return;
        }

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
                    ${window.Utils ? window.Utils.formatCurrency(c.amount) : c.amount} | ${window.Utils ? window.Utils.formatNumber(c.hours) : c.hours} hrs
                    ${type === 'projected' ? `<br><small>${window.Utils ? window.Utils.formatNumber(c.probability) : c.probability}% prob</small>` : ''}
                </div>
                <div>
                    <button onclick="openContractModal('${type}', '${c.id}')">Edit</button>
                    <button onclick="removeContract('${c.id}', '${type}')">X</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    // ==========================================
    // SHARED CAPACITY HELPERS
    // ==========================================
    window.getRemainingCapacity = function(prof) {
        if (!prof) return 0;
        
        const inPeriodValue = document.getElementById('in-period-value');
        const inPeriodUnit = document.getElementById('in-period-unit');
        const periodVal = parseFloat(inPeriodValue ? inPeriodValue.value : 1) || 1;
        const periodUnit = inPeriodUnit ? inPeriodUnit.value : 'Years';
        let yearFraction = 1;
        
        const workWeeksPerYear = (prof.schedule && prof.schedule.weeks) ? parseFloat(prof.schedule.weeks) : 52;
        if (periodUnit === 'Months') yearFraction = (periodVal * 4.3452381) / workWeeksPerYear;
        else if (periodUnit === 'Weeks') yearFraction = periodVal / workWeeksPerYear;
        else if (periodUnit === 'Years') yearFraction = periodVal;

        const capacity = window.Utils ? window.Utils.calculateBillableCapacity(prof) : { totalBillableHours: 0 };
        const periodGrossCapacity = capacity.totalBillableHours * yearFraction;

        const usedHoursC = (prof.calibrations && prof.calibrations.confirmed) ? prof.calibrations.confirmed.reduce((s, c) => s + c.hours, 0) : 0;
        const usedHoursP = (prof.calibrations && prof.calibrations.projected) ? prof.calibrations.projected.reduce((s, c) => s + c.hours, 0) : 0;
        
        let catalogHours = 0;
        if (prof.catalog) {
            prof.catalog.forEach(cat => {
                if (cat.type !== 'ticket') {
                    const tVal = parseFloat(cat.timeToProduce) || 0;
                    let hrs = tVal;
                    if (cat.timeUnit === 'Days') hrs = tVal * 8; // standard assumption
                    if (cat.timeUnit === 'Weeks') hrs = tVal * 40;
                    catalogHours += (hrs * cat.expectedTotalSales);
                }
            });
        }

        return periodGrossCapacity - (usedHoursC + usedHoursP + catalogHours);
    };

    window.getCalibrationsGaps = function(prof) {
        if (!prof) return { gapNow: 0, gapEnhanced: 0, gapGoal: 0 };
        const inPeriodValue = document.getElementById('in-period-value');
        const inPeriodUnit = document.getElementById('in-period-unit');
        const periodVal = parseFloat(inPeriodValue ? inPeriodValue.value : 1) || 1;
        const periodUnit = inPeriodUnit ? inPeriodUnit.value : 'Years';
        let yearFraction = 1;
        const workWeeksPerYear = (prof.schedule && prof.schedule.weeks) ? parseFloat(prof.schedule.weeks) : 52;
        if (periodUnit === 'Months') yearFraction = (periodVal * 4.3452381) / workWeeksPerYear;
        else if (periodUnit === 'Weeks') yearFraction = periodVal / workWeeksPerYear;
        else if (periodUnit === 'Years') yearFraction = periodVal;

        const sumC = (prof.calibrations && prof.calibrations.confirmed) ? prof.calibrations.confirmed.reduce((s, c) => s + c.amount, 0) : 0;
        const sumP = (prof.calibrations && prof.calibrations.projected) ? prof.calibrations.projected.reduce((s, c) => s + c.amount, 0) : 0;
        let catalogIncome = 0;
        if (prof.catalog) {
            prof.catalog.forEach(cat => {
                let expectedGross = 0;
                cat.tiers.forEach(tier => {
                    const vol = cat.expectedTotalSales * (tier.percentOfVolume / 100);
                    expectedGross += vol * tier.price;
                });
                let expectedCogs = 0;
                cat.cogs.forEach(c => {
                    if (c.type === 'per_item') expectedCogs += c.amount * cat.expectedTotalSales;
                    else expectedCogs += c.amount;
                });
                catalogIncome += (expectedGross - expectedCogs);
            });
        }
        const totalIncome = sumC + sumP + catalogIncome;

        let unearnedSum = 0;
        if (prof.unearnedIncome && Array.isArray(prof.unearnedIncome.items)) {
            prof.unearnedIncome.items.forEach(item => {
                const amount = parseFloat(item.amount) || 0;
                const freq = parseFloat(item.frequency) || 1;
                if (item.type === 'Monthly') unearnedSum += amount * 12;
                else if (item.type === 'Periodic') unearnedSum += amount * freq;
                else unearnedSum += amount;
            });
        }
        const periodUnearned = unearnedSum * yearFraction;

        const baseCurrentNet = (prof.currentNetIncome) ? parseFloat(prof.currentNetIncome) : 0;
        const meantimeAdjustment = window.Utils ? window.Utils.calculateMeantimeAdjustment(prof) : 0;
        const rawTax = (prof.expenses && prof.expenses.taxRate) ? prof.expenses.taxRate : 30;
        const taxRate = parseFloat(rawTax) / 100;

        const periodTargetNow = (baseCurrentNet * (1 + taxRate) * yearFraction);
        const gapNow = periodTargetNow - periodUnearned - totalIncome;
        const periodTargetEnhanced = ((baseCurrentNet + meantimeAdjustment) * (1 + taxRate) * yearFraction);
        const gapEnhanced = periodTargetEnhanced - periodUnearned - totalIncome;

        let totalNeeds = 0;
        let expensesPercent = 0;
        if (prof.expenses && Array.isArray(prof.expenses.items)) {
            prof.expenses.items.forEach(item => {
                const val = parseFloat(item.amount) || 0;
                if (item.type === 'Percent') expensesPercent += val;
                else if (item.type === 'Monthly') totalNeeds += val * 12;
                else if (item.type === 'Periodic') totalNeeds += val * (item.frequency || 1);
                else totalNeeds += val;
            });
        }
        let goalNet = totalNeeds;
        if (expensesPercent < 100) goalNet = totalNeeds / (1 - (expensesPercent / 100));
        const periodTargetGoal = (goalNet * (1 + taxRate) * yearFraction);
        const gapGoal = periodTargetGoal - periodUnearned - totalIncome;
        
        // Calculate period capacity to return it for UI
        const capacity = window.Utils ? window.Utils.calculateBillableCapacity(prof) : { totalBillableHours: 0 };
        const periodGrossCapacity = capacity.totalBillableHours * yearFraction;

        return { 
            gapNow, gapEnhanced, gapGoal, 
            periodTargetNow, periodTargetEnhanced, periodTargetGoal,
            sumC, sumP, periodGrossCapacity
        };
    };

    function calculateGap() {
        if (!window.Utils || !profile) return;

        // Determine Fraction (Year Fraction) for UI
        const periodVal = parseFloat(inPeriodValue.value) || 1;
        const periodUnit = inPeriodUnit.value;
        const formattedPeriodVal = Utils.formatNumber(periodVal);
        const labelPeriod = `${formattedPeriodVal} ${periodUnit}`;

        const remainingCapacity = window.getRemainingCapacity(profile);
        const gaps = window.getCalibrationsGaps(profile);

        // 1. Check Meantime Adjustments & UI Toggle
        const meantimeAdjustment = Utils.calculateMeantimeAdjustment(profile);
        const toggleEl = document.getElementById('toggle-calibrations-prime');
        const staticTitle = document.getElementById('calibrations-now-static-title');
        const toggleTitle = document.getElementById('calibrations-now-toggle-title');
        
        let usePrime = false;
        if (meantimeAdjustment > 0) {
            if (staticTitle) staticTitle.style.display = 'none';
            if (toggleTitle) toggleTitle.style.display = 'flex';
            if (toggleEl) usePrime = toggleEl.checked;
        } else {
            if (staticTitle) staticTitle.style.display = 'block';
            if (toggleTitle) toggleTitle.style.display = 'none';
        }

        const labelNow = document.getElementById('label-calibrations-now');
        const labelPrime = document.getElementById('label-calibrations-prime');
        if (labelNow && labelPrime) {
            if (usePrime) {
                labelNow.style.color = 'var(--color-text-muted)';
                labelPrime.style.color = 'var(--color-primary)';
            } else {
                labelNow.style.color = 'var(--color-text-main)';
                labelPrime.style.color = 'var(--color-text-muted)';
            }
        }

        const gapNowActive = usePrime ? gaps.gapEnhanced : gaps.gapNow;
        const requiredRateNow = (gapNowActive > 0 && remainingCapacity > 0) ? (gapNowActive / remainingCapacity) : 0;
        const requiredRateGoal = (gaps.gapGoal > 0 && remainingCapacity > 0) ? (gaps.gapGoal / remainingCapacity) : 0;

        // --- RENDER ---

        // Header Labels
        const elLabelNow = document.getElementById('out-period-label-now');
        if (elLabelNow) elLabelNow.textContent = labelPeriod;

        const elLabelGoal = document.getElementById('out-period-label-goal');
        if (elLabelGoal) elLabelGoal.textContent = labelPeriod;

        // NOW Outputs
        const elTargetNow = document.getElementById('out-period-target-now');
        if (elTargetNow) elTargetNow.textContent = Utils.formatCurrency(usePrime ? gaps.periodTargetEnhanced : gaps.periodTargetNow);

        const elGapNow = document.getElementById('out-gap-now');
        if (elGapNow) {
            elGapNow.textContent = Utils.formatCurrency(gapNowActive);
            elGapNow.style.color = gapNowActive > 0 ? 'var(--color-text-error)' : 'green';
        }

        const elRateNow = document.getElementById('out-required-rate-now');
        if (elRateNow) elRateNow.textContent = Utils.formatCurrency(requiredRateNow) + '/hr';

        // GOAL Outputs
        const elTargetGoal = document.getElementById('out-period-target-goal');
        if (elTargetGoal) elTargetGoal.textContent = Utils.formatCurrency(gaps.periodTargetGoal);

        const elGapGoal = document.getElementById('out-gap-goal');
        if (elGapGoal) {
            elGapGoal.textContent = Utils.formatCurrency(gaps.gapGoal);
            elGapGoal.style.color = gaps.gapGoal > 0 ? 'var(--color-text-error)' : 'green';
        }

        const elRateGoal = document.getElementById('out-required-rate-goal');
        if (elRateGoal) elRateGoal.textContent = Utils.formatCurrency(requiredRateGoal) + '/hr';

        // Shared Outputs
        const outTotalConfirmed = document.getElementById('out-total-confirmed');
        const outTotalProjected = document.getElementById('out-total-projected');
        const outCapacityMsg = document.getElementById('out-capacity-msg');
        
        if (outTotalConfirmed) outTotalConfirmed.textContent = Utils.formatCurrency(gaps.sumC);
        if (outTotalProjected) outTotalProjected.textContent = Utils.formatCurrency(gaps.sumP);

        if (outCapacityMsg) {
            outCapacityMsg.textContent = `${Math.round(remainingCapacity)} billable hours remaining (of ${Math.round(gaps.periodGrossCapacity)} total)`;
        }
    }

    // Global exposure
    window.openContractModal = openContractModal;
    window.closeContractModal = closeContractModal;
    window.saveContract = saveContract;
    window.removeContract = removeContract;
    window.handlePeriodChange = handlePeriodChange;
    window.calculateGap = calculateGap;

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

    // ==========================================
    // CATALOG & LIBRARY LOGIC
    // ==========================================
    let currentCatalogItem = null;

    // Helper to compute Global Rates for Base Cost calculations
    window.getGlobalHourlyRates = function(profile) {
        if (!profile) return { now: 0, enhanced: 0, goal: 0 };
        
        let unearnedSum = 0;
        if (profile.unearnedIncome && Array.isArray(profile.unearnedIncome.items)) {
            profile.unearnedIncome.items.forEach(item => {
                const amount = parseFloat(item.amount) || 0;
                const freq = parseFloat(item.frequency) || 1;
                if (item.type === 'Monthly') unearnedSum += amount * 12;
                else if (item.type === 'Periodic') unearnedSum += amount * freq;
                else unearnedSum += amount;
            });
        }

        const capacity = window.Utils ? window.Utils.calculateBillableCapacity(profile) : { totalBillableHours: 0 };
        const totalBillable = capacity.totalBillableHours;

        const currentNet = parseFloat(profile.currentNetIncome) || 0;
        const taxRate = profile.expenses ? (parseFloat(profile.expenses.taxRate) || 0) / 100 : 0.3;
        
        const currentGross = currentNet * (1 + taxRate);
        const meantimeAdjustment = window.Utils ? window.Utils.calculateMeantimeAdjustment(profile) : 0;
        const enhancedGross = (currentNet + meantimeAdjustment) * (1 + taxRate);
        const goalGross = (profile.goals && profile.goals.gross) ? profile.goals.gross : 0;

        const calcHourly = (gross) => {
            if (totalBillable <= 0) return 0;
            const adjustedGross = Math.max(0, gross - unearnedSum);
            return adjustedGross / totalBillable;
        };

        return {
            now: calcHourly(currentGross),
            enhanced: calcHourly(enhancedGross),
            goal: calcHourly(goalGross)
        };
    };

    window.openCatalogModal = (id = null) => {
        const modal = document.getElementById('modal-catalog');
        if (!modal) return;
        
        // Calculate Rates and Store for UI
        window._catalogRatesBase = window.getGlobalHourlyRates(profile);

        if (id !== null) {
            const found = profile.catalog.find(c => c.id === id);
            if (found) {
                currentCatalogItem = JSON.parse(JSON.stringify(found));
            }
        }
        
        // Ensure new fields exist
        if (currentCatalogItem) {
            if (!currentCatalogItem.rateMode) currentCatalogItem.rateMode = 'custom';
            if (!currentCatalogItem.baseCost) currentCatalogItem.baseCost = 0;
            if (!Array.isArray(currentCatalogItem.overheadProjectIds)) {
                // Migrate old single string if exists
                if (currentCatalogItem.overheadProjectId) {
                    currentCatalogItem.overheadProjectIds = [currentCatalogItem.overheadProjectId];
                } else {
                    currentCatalogItem.overheadProjectIds = [];
                }
            }
            currentCatalogItem.tiers.forEach(t => {
                if (typeof t.adjustmentPercent === 'undefined') t.adjustmentPercent = 0;
                if (typeof t.isFixed === 'undefined') t.isFixed = false;
                if (typeof t.volumeAmount === 'undefined') {
                    t.volumeAmount = (currentCatalogItem.expectedTotalSales * (t.percentOfVolume / 100)) || 0;
                }
            });
        }
        
        // Populate lines of work
        const selLineOfWork = document.getElementById('cat-line-of-work');
        if (selLineOfWork) {
            selLineOfWork.innerHTML = '';
            if (profile.linesOfWork && profile.linesOfWork.length > 0) {
                profile.linesOfWork.forEach(bd => {
                    const opt = document.createElement('option');
                    opt.value = bd.id;
                    opt.textContent = bd.label || 'Untitled Line of Work';
                    selLineOfWork.appendChild(opt);
                });
            } else {
                selLineOfWork.innerHTML = '<option value="">No Lines of Work Found</option>';
            }
        }

        // Populate overhead profiles checkboxes
        const overheadList = document.getElementById('cat-overhead-profiles-list');
        if (overheadList) {
            overheadList.innerHTML = '';
            if (window.overheadProjects && window.overheadProjects.length > 0) {
                window.overheadProjects.forEach(op => {
                    const label = document.createElement('label');
                    label.style.display = 'flex';
                    label.style.alignItems = 'center';
                    label.style.gap = '5px';
                    label.style.fontSize = '0.85rem';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.name = 'cat-overhead-checkbox';
                    cb.value = op.id;
                    if (currentCatalogItem && currentCatalogItem.overheadProjectIds.includes(op.id)) {
                        cb.checked = true;
                    }
                    cb.onchange = window.updateCatalogBaseCost;
                    
                    label.appendChild(cb);
                    label.appendChild(document.createTextNode(op.name || 'Untitled Profile'));
                    overheadList.appendChild(label);
                });
            } else {
                overheadList.innerHTML = '<span style="font-size:0.85rem; color:#666;">No Business Profiles found. Create one to add overhead.</span>';
            }
        }

        if (id !== null && currentCatalogItem) {
            document.getElementById('cat-id').value = currentCatalogItem.id;
            document.getElementById('cat-name').value = currentCatalogItem.name || '';
            document.getElementById('cat-type').value = currentCatalogItem.type || 'good';
            if (selLineOfWork) selLineOfWork.value = currentCatalogItem.lineOfWorkId || '';
            document.getElementById('cat-volume').value = currentCatalogItem.expectedTotalSales || 1;
            document.getElementById('cat-time-value').value = currentCatalogItem.timeToProduce || 0;
            document.getElementById('cat-time-unit').value = currentCatalogItem.timeUnit || 'Hours';
            
            const radios = document.getElementsByName('catRateMode');
            radios.forEach(r => r.checked = (r.value === currentCatalogItem.rateMode));
            
            document.getElementById('btn-delete-catalog').style.display = 'block';
            document.getElementById('modal-catalog-title').textContent = 'Edit Catalog Item';
        } else {
            currentCatalogItem = {
                id: window.Utils ? window.Utils.generateId() : 'cat-' + Date.now(),
                name: '',
                type: 'good',
                lineOfWorkId: selLineOfWork ? selLineOfWork.value : '',
                overheadProjectIds: [],
                expectedTotalSales: 1,
                timeToProduce: 0,
                timeUnit: 'Hours',
                rateMode: 'custom',
                baseCost: 0,
                tiers: [{ id: 't1', name: 'Standard Price', adjustmentPercent: 0, price: 0, percentOfVolume: 100, isFixed: false, volumeAmount: 1 }],
                cogs: []
            };
            document.getElementById('cat-id').value = '';
            document.getElementById('cat-name').value = '';
            document.getElementById('cat-type').value = 'good';
            document.getElementById('cat-volume').value = 1;
            document.getElementById('cat-time-value').value = 0;
            document.getElementById('cat-time-unit').value = 'Hours';
            document.getElementById('cat-base-cost').value = 0;
            const radios = document.getElementsByName('catRateMode');
            radios.forEach(r => r.checked = (r.value === 'custom'));
            
            document.getElementById('btn-delete-catalog').style.display = 'none';
            document.getElementById('modal-catalog-title').textContent = 'Add Catalog Item';
        }

        window.toggleCatalogTimeInput();
        window.updateCatalogBaseCost();
        renderCatalogCogsForm();
        
        modal.showModal();
    };

    window.toggleCatalogTimeInput = () => {
        const type = document.getElementById('cat-type').value;
        const timeContainer = document.getElementById('cat-time-container');
        const rateSelectors = document.getElementById('cat-rate-selector-container');
        
        if (type === 'ticket') {
            timeContainer.style.display = 'none';
            rateSelectors.style.display = 'none';
            
            // Force rate mode to custom for tickets
            const radios = document.getElementsByName('catRateMode');
            radios.forEach(r => r.checked = (r.value === 'custom'));
            currentCatalogItem.rateMode = 'custom';
        } else {
            timeContainer.style.display = 'block';
            rateSelectors.style.display = 'block';
        }
        window.updateCatalogBaseCost();
    };

    window.handleManualBaseCost = () => {
        if (!currentCatalogItem) return;
        const radios = document.getElementsByName('catRateMode');
        radios.forEach(r => r.checked = (r.value === 'custom'));
        currentCatalogItem.rateMode = 'custom';
        currentCatalogItem.baseCost = parseFloat(document.getElementById('cat-base-cost').value) || 0;
        
        document.getElementById('cat-base-cost-formula').textContent = `(Custom)`;
        window.renderCatalogTiersForm();
    };

    window.updateCatalogBaseCost = () => {
        if (!currentCatalogItem) return;
        const val = parseFloat(document.getElementById('cat-time-value').value) || 0;
        const unit = document.getElementById('cat-time-unit').value;
        
        // Read checked overhead profiles
        const cbNodes = document.querySelectorAll('input[name="cat-overhead-checkbox"]:checked');
        currentCatalogItem.overheadProjectIds = Array.from(cbNodes).map(cb => cb.value);
        
        // Convert to hours
        let hours = val;
        if (unit === 'Days') hours = val * 8; // standard 8 hour day assumption
        if (unit === 'Weeks') hours = val * 40; // standard 40 hour week assumption
        
        let selectedMode = 'custom';
        const radios = document.getElementsByName('catRateMode');
        radios.forEach(r => { if(r.checked) selectedMode = r.value; });
        
        currentCatalogItem.rateMode = selectedMode;
        currentCatalogItem.timeToProduce = val;
        currentCatalogItem.timeUnit = unit;

        // Calculate overhead rate
        let overheadRate = 0;
        if (currentCatalogItem.overheadProjectIds.length > 0 && window.overheadProjects) {
            let totalCombinedOverhead = 0;
            currentCatalogItem.overheadProjectIds.forEach(id => {
                const linkedProj = window.overheadProjects.find(p => p.id === id);
                if (linkedProj) {
                    let projFixed = 0;
                    let projPercent = 0;
                    (linkedProj.expenses || []).forEach(e => {
                        if (e.type === 'Percent') projPercent += (e.baseAmount || e.amount || 0);
                        else projFixed += (e.amount || 0);
                    });
                    let totalOverhead = projFixed;
                    if (projPercent > 0 && projPercent < 100) {
                        totalOverhead = projFixed / (1 - (projPercent / 100));
                    }
                    totalCombinedOverhead += totalOverhead;
                }
            });
            const capacity = window.Utils ? window.Utils.calculateBillableCapacity(profile) : { totalBillableHours: 0 };
            if (capacity.totalBillableHours > 0) {
                overheadRate = totalCombinedOverhead / capacity.totalBillableHours;
            }
        }

        // Derive _catalogRates by adding overhead rate to _catalogRatesBase
        if (window._catalogRatesBase) {
            window._catalogRates = {
                now: window._catalogRatesBase.now + overheadRate,
                enhanced: window._catalogRatesBase.enhanced + overheadRate,
                goal: window._catalogRatesBase.goal + overheadRate
            };
            
            // Update labels
            const lblNow = document.getElementById('cat-rate-now-lbl');
            const lblEnh = document.getElementById('cat-rate-enhanced-lbl');
            const lblGoal = document.getElementById('cat-rate-goal-lbl');
            if (lblNow) lblNow.textContent = `$${window._catalogRates.now.toFixed(2)}/hr`;
            if (lblEnh) lblEnh.textContent = `$${window._catalogRates.enhanced.toFixed(2)}/hr`;
            if (lblGoal) lblGoal.textContent = `$${window._catalogRates.goal.toFixed(2)}/hr`;
        }
        
        const formulaEl = document.getElementById('cat-base-cost-formula');
        const baseCostEl = document.getElementById('cat-base-cost');

        if (selectedMode !== 'custom') {
            const rate = window._catalogRates[selectedMode] || 0;
            currentCatalogItem.baseCost = rate * hours;
            formulaEl.textContent = `(${hours} hrs × $${rate.toFixed(2)}/hr)`;
            baseCostEl.value = currentCatalogItem.baseCost.toFixed(2);
            baseCostEl.disabled = true;
        } else {
            // It's custom, don't overwrite if they manually typed it unless it's new
            if (!currentCatalogItem.baseCost) currentCatalogItem.baseCost = 0;
            formulaEl.textContent = `(Custom)`;
            baseCostEl.value = currentCatalogItem.baseCost.toFixed(2);
            baseCostEl.disabled = false;
        }

        window.renderCatalogTiersForm();
    };

    window.generateCatalogTiers = () => {
        if (!currentCatalogItem) return;
        const count = parseInt(document.getElementById('cat-tiers-count').value) || 1;
        currentCatalogItem.tiers = [];
        
        const totalVol = currentCatalogItem.expectedTotalSales || 1;
        const baseAmount = totalVol / count;
        
        for(let i=0; i<count; i++) {
            currentCatalogItem.tiers.push({
                id: 't-' + Date.now() + '-' + i,
                name: `Tier ${i+1}`,
                adjustmentPercent: 0,
                price: 0,
                isFixed: false,
                volumeAmount: baseAmount,
                percentOfVolume: (baseAmount / totalVol) * 100
            });
        }
        window.renderCatalogTiersForm();
    };

    window.removeCatalogTier = (id) => {
        if (!currentCatalogItem) return;
        currentCatalogItem.tiers = currentCatalogItem.tiers.filter(t => t.id !== id);
        window.rebalanceCatalogTiers();
    };

    window.handleCatalogVolumeChange = () => {
        if (!currentCatalogItem) return;
        const newTotal = parseFloat(document.getElementById('cat-volume').value) || 1;
        currentCatalogItem.expectedTotalSales = newTotal;
        window.rebalanceCatalogTiers();
    };

    window.toggleCatalogTierFixed = (id, checked) => {
        const tier = currentCatalogItem.tiers.find(t => t.id === id);
        if (tier) {
            tier.isFixed = checked;
            window.rebalanceCatalogTiers();
        }
    };

    window.rebalanceCatalogTiers = (changedId = null) => {
        if (!currentCatalogItem || currentCatalogItem.tiers.length === 0) return;
        
        const totalExpected = currentCatalogItem.expectedTotalSales || 1;
        
        let fixedSum = 0;
        let unfixedTiers = [];

        currentCatalogItem.tiers.forEach(t => {
            // Prevent negative volume
            t.volumeAmount = Math.max(0, t.volumeAmount);
            if (t.isFixed) {
                fixedSum += t.volumeAmount;
            } else {
                unfixedTiers.push(t);
            }
        });

        // Error check if everything is fixed
        if (unfixedTiers.length === 0) {
            if (Math.abs(fixedSum - totalExpected) > 0.01) {
                alert(`Error: Your fixed tiers total ${fixedSum.toFixed(1)}, but your Expected Total Sales is ${totalExpected}. Please adjust or unfix a tier.`);
                // We'll still render to let them fix it
            }
        } else {
            let remaining = totalExpected - fixedSum;
            if (remaining < 0) {
                alert(`Warning: Your fixed tiers (${fixedSum.toFixed(1)}) exceed your Expected Total Sales (${totalExpected}). Remaining unfixed tiers set to 0. Please adjust!`);
                unfixedTiers.forEach(t => t.volumeAmount = 0);
            } else {
                const addPerTier = remaining / unfixedTiers.length;
                unfixedTiers.forEach(t => t.volumeAmount = addPerTier);
            }
        }

        // Recalculate percentages
        currentCatalogItem.tiers.forEach(t => {
            t.percentOfVolume = totalExpected > 0 ? (t.volumeAmount / totalExpected) * 100 : 0;
        });

        window.renderCatalogTiersForm();
    };

    window.updateCatalogTierAmount = (changedId, newAmount) => {
        if (!currentCatalogItem) return;
        const tier = currentCatalogItem.tiers.find(t => t.id === changedId);
        if (!tier) return;
        
        tier.volumeAmount = Math.max(0, newAmount);
        tier.isFixed = true; // Auto-lock when manually edited
        
        window.rebalanceCatalogTiers(changedId);
    };

    window.renderCatalogTiersForm = function() {
        const container = document.getElementById('cat-tiers-list');
        if (!container) return;
        container.innerHTML = '';
        
        const baseCost = currentCatalogItem.baseCost || 0;

        currentCatalogItem.tiers.forEach(tier => {
            const adjustment = tier.adjustmentPercent || 0;
            const finalPrice = baseCost * (1 + (adjustment / 100));
            tier.price = finalPrice; // auto-save the computed price

            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.gap = '5px';
            div.style.marginBottom = '10px';
            div.style.alignItems = 'center';
            
            // Checkbox for fixed
            const fixedCheck = tier.isFixed ? 'checked' : '';
            
            div.innerHTML = `
                <input type="text" class="form-control" placeholder="Tier Name" value="${tier.name}" onchange="window.updateCatalogTier('${tier.id}', 'name', this.value)" style="flex:2;">
                
                <div style="flex:1; display:flex; align-items:center;">
                    <input type="number" class="form-control" placeholder="0" value="${tier.adjustmentPercent}" onchange="window.updateCatalogTier('${tier.id}', 'adjustmentPercent', parseFloat(this.value))">
                    <span style="font-size:0.8rem; margin-left:3px;">%</span>
                </div>
                
                <div style="flex:1; text-align:center; font-weight:bold; font-size:0.9rem;">
                    $${finalPrice.toFixed(2)}
                </div>
                
                <div style="width:40px; text-align:center;">
                    <input type="checkbox" onchange="window.toggleCatalogTierFixed('${tier.id}', this.checked)" ${fixedCheck}>
                </div>
                
                <div style="flex:1; display:flex; align-items:center;">
                    <input type="number" step="0.1" class="form-control" placeholder="Amt" value="${parseFloat(tier.volumeAmount).toFixed(1)}" onchange="window.updateCatalogTierAmount('${tier.id}', parseFloat(this.value))">
                </div>
                
                <div style="width:50px; text-align:center; font-size:0.8rem; color: var(--color-text-muted);">
                    ${tier.percentOfVolume.toFixed(1)}%
                </div>
                
                <div style="width:20px;">
                    <button type="button" onclick="window.removeCatalogTier('${tier.id}')" style="background:none; border:none; color:red; cursor:pointer; font-weight:bold;">X</button>
                </div>
            `;
            container.appendChild(div);
        });

        window.updateCatalogGapInfo();
    }

    window.updateCatalogGapInfo = function() {
        if (!currentCatalogItem) return;
        
        // 1. Calculate current item's net per unit
        let expectedGross = 0;
        currentCatalogItem.tiers.forEach(tier => {
            const vol = currentCatalogItem.expectedTotalSales * ((tier.percentOfVolume || 0) / 100);
            expectedGross += vol * (tier.price || 0);
        });
        let expectedCogs = 0;
        currentCatalogItem.cogs.forEach(c => {
            if (c.type === 'per_item') expectedCogs += (c.amount || 0) * currentCatalogItem.expectedTotalSales;
            else expectedCogs += (c.amount || 0);
        });
        const totalNetProfit = expectedGross - expectedCogs;
        const currentSalesVolume = currentCatalogItem.expectedTotalSales || 1;
        const netPerUnit = totalNetProfit / currentSalesVolume;

        // 2. Get gaps and old net profit
        const gaps = window.getCalibrationsGaps(profile);
        let oldTotalNetProfit = 0;
        if (currentCatalogItem.id && profile.catalog) {
            const oldCat = profile.catalog.find(c => c.id === currentCatalogItem.id);
            if (oldCat) {
                let oldGross = 0;
                oldCat.tiers.forEach(tier => {
                    const vol = oldCat.expectedTotalSales * ((tier.percentOfVolume || 0) / 100);
                    oldGross += vol * (tier.price || 0);
                });
                let oldCogs = 0;
                oldCat.cogs.forEach(c => {
                    if (c.type === 'per_item') oldCogs += (c.amount || 0) * oldCat.expectedTotalSales;
                    else oldCogs += (c.amount || 0);
                });
                oldTotalNetProfit = oldGross - oldCogs;
            }
        }

        // 3. Gaps excluding this item
        const gapNowEx = gaps.gapNow + oldTotalNetProfit;
        const gapEnhancedEx = gaps.gapEnhanced + oldTotalNetProfit;
        const gapGoalEx = gaps.gapGoal + oldTotalNetProfit;

        // Algebraic Gap Calculation
        let fixedGross = 0;
        let fixedVol = 0;
        let unfixedCount = 0;
        let unfixedPriceSum = 0;
        
        currentCatalogItem.tiers.forEach(t => {
            if (t.isFixed) {
                fixedGross += (t.volumeAmount || 0) * (t.price || 0);
                fixedVol += (t.volumeAmount || 0);
            } else {
                unfixedCount++;
                unfixedPriceSum += (t.price || 0);
            }
        });

        let fixedCogs = 0;
        let perItemCogs = 0;
        currentCatalogItem.cogs.forEach(c => {
            if (c.type === 'per_item') perItemCogs += (c.amount || 0);
            else fixedCogs += (c.amount || 0);
        });

        let avgUnfixedPrice = 0;
        if (unfixedCount > 0) {
            avgUnfixedPrice = unfixedPriceSum / unfixedCount;
        } else {
            let totalTiers = currentCatalogItem.tiers.length;
            if (totalTiers > 0) {
                avgUnfixedPrice = currentCatalogItem.tiers.reduce((s,t) => s + (t.price||0), 0) / totalTiers;
            }
        }

        const netPerUnfixed = avgUnfixedPrice - perItemCogs;

        const calcV = (G) => {
            if (G <= 0) return 0;
            
            if (unfixedCount === 0) {
                const totalNet = fixedGross - (fixedCogs + fixedVol * perItemCogs);
                if (fixedVol === 0 || totalNet <= 0) return "N/A";
                return Math.ceil(G / (totalNet / fixedVol));
            }

            if (netPerUnfixed <= 0) {
                const fixedNet = fixedGross - (fixedCogs + fixedVol * perItemCogs);
                if (fixedNet >= G) return fixedVol;
                return "N/A";
            }

            const numerator = G - fixedGross + (fixedVol * avgUnfixedPrice) + fixedCogs;
            let v = Math.ceil(numerator / netPerUnfixed);
            
            if (v < fixedVol) return fixedVol;
            return v;
        };

        let shiftNow = calcV(gapNowEx);
        let shiftEnhanced = calcV(gapEnhancedEx);
        let shiftGoal = calcV(gapGoalEx);

        const elNow = document.getElementById('cat-shift-now');
        const elEnh = document.getElementById('cat-shift-enhanced');
        const elGoal = document.getElementById('cat-shift-goal');
        if (elNow) elNow.textContent = shiftNow;
        if (elEnh) elEnh.textContent = shiftEnhanced;
        if (elGoal) elGoal.textContent = shiftGoal;
    };

    window.updateCatalogTier = (id, field, value) => {
        const tier = currentCatalogItem.tiers.find(t => t.id === id);
        if (tier) {
            tier[field] = value;
            if (field === 'adjustmentPercent') {
                window.renderCatalogTiersForm(); // re-calculate and re-render price
            }
        }
    };

    window.addCatalogCogs = () => {
        if (!currentCatalogItem) return;
        currentCatalogItem.cogs.push({
            id: 'c-' + Date.now(),
            name: 'New Expense',
            amount: 0,
            type: 'per_item'
        });
        renderCatalogCogsForm();
    };

    window.removeCatalogCogs = (id) => {
        if (!currentCatalogItem) return;
        currentCatalogItem.cogs = currentCatalogItem.cogs.filter(c => c.id !== id);
        renderCatalogCogsForm();
    };

    window.renderCatalogCogsForm = function() {
        const container = document.getElementById('cat-cogs-list');
        if (!container) return;
        container.innerHTML = '';
        currentCatalogItem.cogs.forEach(cogs => {
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.gap = '10px';
            div.style.marginBottom = '10px';
            div.style.alignItems = 'center';
            div.innerHTML = `
                <input type="text" class="form-control" placeholder="Expense Name" value="${cogs.name}" onchange="window.updateCatalogCogs('${cogs.id}', 'name', this.value)" style="flex:2;">
                <input type="number" class="form-control" placeholder="Amount $" value="${cogs.amount}" onchange="window.updateCatalogCogs('${cogs.id}', 'amount', parseFloat(this.value))" style="flex:1;">
                <select class="form-control" onchange="window.updateCatalogCogs('${cogs.id}', 'type', this.value)" style="flex:1;">
                    <option value="per_item" ${cogs.type === 'per_item' ? 'selected' : ''}>Per Item Sold</option>
                    <option value="fixed" ${cogs.type === 'fixed' ? 'selected' : ''}>Fixed Total</option>
                </select>
                <button type="button" onclick="window.removeCatalogCogs('${cogs.id}')" style="background:none; border:none; color:red; cursor:pointer; font-weight:bold;">X</button>
            `;
            container.appendChild(div);
        });
        
        window.updateCatalogGapInfo();
    }

    window.updateCatalogCogs = (id, field, value) => {
        const cogs = currentCatalogItem.cogs.find(c => c.id === id);
        if (cogs) {
            cogs[field] = value;
            window.updateCatalogGapInfo();
        }
    };

    window.saveCatalogItem = async () => {
        if (!currentCatalogItem) return;
        
        currentCatalogItem.name = document.getElementById('cat-name').value || 'Untitled Item';
        currentCatalogItem.type = document.getElementById('cat-type').value;
        const selLineOfWork = document.getElementById('cat-line-of-work');
        currentCatalogItem.lineOfWorkId = selLineOfWork ? selLineOfWork.value : '';
        currentCatalogItem.expectedTotalSales = parseFloat(document.getElementById('cat-volume').value) || 1;
        currentCatalogItem.timeToProduce = parseFloat(document.getElementById('cat-time-value').value) || 0;
        currentCatalogItem.timeUnit = document.getElementById('cat-time-unit').value;

        // Validation
        const volSum = currentCatalogItem.tiers.reduce((s, t) => s + (t.volumeAmount || 0), 0);
        if (Math.abs(volSum - currentCatalogItem.expectedTotalSales) > 0.01 && currentCatalogItem.tiers.length > 0) {
            alert(`Error: Pricing Tiers amounts must exactly equal Expected Total Sales (${currentCatalogItem.expectedTotalSales}). Currently totals: ${volSum.toFixed(1)}`);
            return;
        }

        if (!profile.catalog) profile.catalog = [];
        
        const existingIdx = profile.catalog.findIndex(c => c.id === currentCatalogItem.id);
        
        // Calculate newly added hours vs remaining capacity
        let newHours = 0;
        if (currentCatalogItem.type !== 'ticket') {
            const tVal = parseFloat(currentCatalogItem.timeToProduce) || 0;
            let hrs = tVal;
            if (currentCatalogItem.timeUnit === 'Days') hrs = tVal * 8;
            if (currentCatalogItem.timeUnit === 'Weeks') hrs = tVal * 40;
            newHours = hrs * currentCatalogItem.expectedTotalSales;
        }

        let oldHours = 0;
        if (existingIdx >= 0) {
            const oldCat = profile.catalog[existingIdx];
            if (oldCat.type !== 'ticket') {
                const tVal = parseFloat(oldCat.timeToProduce) || 0;
                let hrs = tVal;
                if (oldCat.timeUnit === 'Days') hrs = tVal * 8;
                if (oldCat.timeUnit === 'Weeks') hrs = tVal * 40;
                oldHours = hrs * (parseFloat(oldCat.expectedTotalSales) || 1);
            }
        }

        const deltaHours = newHours - oldHours;
        const currentRemaining = window.getRemainingCapacity(profile);
        
        if (deltaHours > currentRemaining) {
            const confirmed = confirm(`Warning: Producing these items requires ${deltaHours.toFixed(1)} additional hours, but you only have ${currentRemaining.toFixed(1)} hours of capacity remaining for this period. Do you want to proceed and overbook yourself?`);
            if (!confirmed) return;
        }

        if (existingIdx >= 0) {
            profile.catalog[existingIdx] = currentCatalogItem;
        } else {
            profile.catalog.push(currentCatalogItem);
        }

        await Store.saveIndependentProfile(profile);
        document.getElementById('modal-catalog').close();
        renderCatalogList();
        calculateGap();
    };

    window.deleteCatalogItem = async () => {
        if (!currentCatalogItem || !profile.catalog) return;
        if (!confirm("Delete this catalog item?")) return;
        
        profile.catalog = profile.catalog.filter(c => c.id !== currentCatalogItem.id);
        await Store.saveIndependentProfile(profile);
        document.getElementById('modal-catalog').close();
        renderCatalogList();
        calculateGap();
    };

    window.renderCatalogList = function() {
        const container = document.getElementById('catalog-list');
        if (!container) return;
        container.innerHTML = '';
        
        if (!profile.catalog || profile.catalog.length === 0) {
            container.innerHTML = '<div style="color:var(--color-text-muted); font-size:0.8rem;">No catalog items.</div>';
            document.getElementById('out-total-catalog-left').textContent = '$0';
            return;
        }

        let totalExpectedNet = 0;

        profile.catalog.forEach(cat => {
            let expectedGross = 0;
            cat.tiers.forEach(tier => {
                const vol = cat.expectedTotalSales * (tier.percentOfVolume / 100);
                expectedGross += vol * tier.price;
            });

            let expectedCogs = 0;
            cat.cogs.forEach(c => {
                if (c.type === 'per_item') {
                    expectedCogs += c.amount * cat.expectedTotalSales;
                } else {
                    expectedCogs += c.amount;
                }
            });

            const expectedNet = expectedGross - expectedCogs;
            totalExpectedNet += expectedNet;

            const div = document.createElement('div');
            div.className = 'contract-card';
            div.innerHTML = `
                <div>
                    <strong>${cat.name}</strong> (${cat.type})<br>
                    ${window.Utils ? window.Utils.formatCurrency(expectedNet) : expectedNet} Net <small>(${cat.expectedTotalSales} items)</small>
                </div>
                <div>
                    <button onclick="openCatalogModal('${cat.id}')">Edit</button>
                </div>
            `;
            container.appendChild(div);
        });

        document.getElementById('out-total-catalog-left').textContent = window.Utils ? window.Utils.formatCurrency(totalExpectedNet) : totalExpectedNet;
    }

})(); // End IIF
