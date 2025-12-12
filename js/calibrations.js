/**
 * Logic for Calibrations Dashboard
 * Enhanced with Flexible Periods and Detailed Contract Tracking
 */

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
let profile = Store.getIndependentProfile();
let activeContractType = 'confirmed'; // 'confirmed' or 'projected'

function init() {
    profile = Store.getIndependentProfile();

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

    inPeriodValue.value = profile.calibrations.periodValue || 1;
    inPeriodUnit.value = profile.calibrations.periodUnit || 'Years';

    renderContracts();
    calculateGap();

    // Listeners
    inPeriodValue.addEventListener('input', handlePeriodChange);
    inPeriodUnit.addEventListener('change', handlePeriodChange);
}

function handlePeriodChange() {
    profile.calibrations.periodValue = parseFloat(inPeriodValue.value) || 1;
    profile.calibrations.periodUnit = inPeriodUnit.value;
    Store.saveIndependentProfile(profile);
    calculateGap();
}

/**
 * CONTRACT MANAGEMENT
 */
function openContractModal(type) {
    activeContractType = type;
    // Reset form
    document.getElementById('c-name').value = '';
    document.getElementById('c-method').value = 'rate';
    toggleMethod();
    modal.showModal();
}

function closeContractModal() {
    modal.close();
}

function toggleMethod() {
    const method = document.getElementById('c-method').value;
    if (method === 'rate') {
        document.getElementById('method-rate').classList.remove('hidden');
        document.getElementById('method-flat').classList.add('hidden');
    } else {
        document.getElementById('method-rate').classList.add('hidden');
        document.getElementById('method-flat').classList.remove('hidden');
    }
}

function saveContract() {
    const method = document.getElementById('c-method').value;
    const name = document.getElementById('c-name').value || 'Unnamed Source';

    let amount = 0;
    let hours = 0;
    let details = '';

    // Get Billable Capacity Limits
    const capacity = Utils.calculateBillableCapacity(profile);
    const ratio = capacity.billableRatio || 1;

    // Derived Billable Limits (The user's "Real" capacity for contracts)
    const rawHoursPerDay = profile.schedule.hours || 6;
    const rawDaysPerWeek = profile.schedule.days || 4;

    const bHoursPerDay = rawHoursPerDay * ratio;
    const bDaysPerWeek = rawDaysPerWeek * ratio;

    if (method === 'rate') {
        const rate = parseFloat(document.getElementById('c-rate').value) || 0;
        const rateUnit = document.getElementById('c-rate-unit').value;

        // Work Density: X [Unit] PER [Freq]
        const densityVal = parseFloat(document.getElementById('c-density-value').value) || 0;
        const densityUnit = document.getElementById('c-density-unit').value;
        const densityFreq = document.getElementById('c-density-freq').value;

        // Contract Duration
        const duration = parseFloat(document.getElementById('c-duration').value) || 1;
        const durationUnit = document.getElementById('c-duration-unit').value;

        // 1. Validation Logic (Against BILLABLE limits)
        const isValid = validateSchedule(densityVal, densityUnit, densityFreq, bHoursPerDay, bDaysPerWeek);
        if (!isValid) {
            // Check formatted string for alert
            let limitStr = '';
            if (densityFreq === 'Day' && densityUnit === 'Hours') limitStr = `${bHoursPerDay.toFixed(1)} hours/day`;
            if (densityFreq === 'Week' && densityUnit === 'Days') limitStr = `${bDaysPerWeek.toFixed(1)} days/week`;

            if (!confirm(`Warning: This schedule exceeds your BILLABLE capacity (${limitStr} available). Do you want to proceed anyway?`)) {
                return; // Abort save
            }
        }

        // 2. Calculate Total Units of Work over Duration
        // Convert Duration to Weeks
        let durationWeeks = duration;
        if (durationUnit === 'Months') durationWeeks = duration * 4.33;
        if (durationUnit === 'Years') durationWeeks = duration * 52;

        // Convert Density to Hours/Week (Effective BILLABLE Hours)
        let effectiveHoursPerWeek = 0;

        // Normalized to Weekly Hours using Derived Billable Limits
        if (densityUnit === 'Hours') {
            if (densityFreq === 'Day') effectiveHoursPerWeek = densityVal * rawDaysPerWeek; // Assuming "Hours/Day" implies working X days. Actually, if I say "2 Hours per Day", I mean 2 * DaysInWeek.
            // Wait, does "2 Hours per Day" mean "2 Billable Hours"? Yes. 
            // Do I multiply by Raw Days or Billable Days?
            // Usually "Per Day" implies "Every Working Day".
            // So: Val * rawDaysPerWeek. 
            // (e.g. 2 hours * 4 days = 8 hours/week).

            if (densityFreq === 'Day') effectiveHoursPerWeek = densityVal * rawDaysPerWeek;
            if (densityFreq === 'Week') effectiveHoursPerWeek = densityVal;
            if (densityFreq === 'Month') effectiveHoursPerWeek = densityVal / 4.33;
            if (densityFreq === 'Year') effectiveHoursPerWeek = densityVal / 52;
        }
        else if (densityUnit === 'Days') {
            // "1 Day per Week".
            // Since contracts are in Billable Time, "1 Day" = "1 Billable Day".
            // 1 Billable Day = bHoursPerDay.

            const hoursPerBillableDay = bHoursPerDay;

            if (densityFreq === 'Week') effectiveHoursPerWeek = densityVal * hoursPerBillableDay;
            if (densityFreq === 'Month') effectiveHoursPerWeek = (densityVal * hoursPerBillableDay) / 4.33;
            if (densityFreq === 'Day') effectiveHoursPerWeek = 999; // Invalid
            if (densityFreq === 'Year') effectiveHoursPerWeek = (densityVal * hoursPerBillableDay) / 52;
        }
        else if (densityUnit === 'Weeks') {
            // "1 Week per Month"
            // 1 Billable Week = bDaysPerWeek * bHoursPerDay (or just total billable hours / weeks?).
            // Yes, Billable Capacity per Week = capacity.totalBillableHours / weeks.
            // Or simpler: bHoursPerDay * rawDaysPerWeek? No.
            // Billable Hours Per Week = rawDaysPerWeek * rawHoursPerDay * ratio.
            const hoursPerBillableWeek = (rawDaysPerWeek * rawHoursPerDay) * ratio;

            if (densityFreq === 'Month') effectiveHoursPerWeek = (densityVal * hoursPerBillableWeek) / 4.33;
            if (densityFreq === 'Year') effectiveHoursPerWeek = (densityVal * hoursPerBillableWeek) / 52;
        }

        // Total Hours for Contract
        hours = effectiveHoursPerWeek * durationWeeks;

        // Calculate Amount 
        let amountCalc = 0;

        if (rateUnit === 'Project') {
            amountCalc = rate; // Flat rate for the whole definition
        } else {
            // Rate is Per Hour/Day/etc.
            // We need to know if the USER means "Rate per Billable Hour" or "Rate per Working Hour"?
            // Usually Rate per Billable Unit.

            let quantity = 0;
            if (rateUnit === 'Hour') quantity = hours;
            if (rateUnit === 'Day') quantity = hours / bHoursPerDay;
            if (rateUnit === 'Week') quantity = hours / (bHoursPerDay * rawDaysPerWeek); // ?
            // If Rate Per Week -> It usually implies "Per Billable Week" which is hours / (totalWeekHours * Ratio)
            // Let's stick to standard conversions:
            // If I charge $1000/week. And I work 4 weeks. I get $4000.
            // Regardless of hours. 
            // Logic: Amount = Rate * (Frequency adjusted Duration).

            // BUT, we calculated `effectiveHoursPerWeek`.
            // If Rate is Per Week. Amount = Rate * (effectiveHoursPerWeek / standardWeek?)
            // No. "Volume: 1 Week per Month". "Rate: $1000 per Week".
            // Amount = 1000 * Total Weeks. 
            // We have densityVal and Duration.

            // Let's do a simpler Amount calculation based on the INPUTS, decoupling from Hours for a moment.
            // Total "Units" of volume.

            // Total Density Units = densityVal * (duration converted to densityFreq).
            // e.g. 1 (Day) per Week. Duration 4 Weeks. -> 4 Days.
            // Rate $500 per Day. -> $2000.

            let totalDensityUnits = 0;
            let durationInFreq = 0;

            if (densityFreq === 'Day') durationInFreq = durationWeeks * rawDaysPerWeek; // Occurrences
            if (densityFreq === 'Week') durationInFreq = durationWeeks;
            if (densityFreq === 'Month') durationInFreq = durationWeeks / 4.33;
            if (densityFreq === 'Year') durationInFreq = durationWeeks / 52;

            totalDensityUnits = densityVal * durationInFreq;

            // Now match Rate Unit to Density Unit?
            // If Density is "Days" and Rate is "Day", perfect.
            // If Density is "Hours" and Rate is "Hour", perfect.

            if (rateUnit === densityUnit) {
                amountCalc = rate * totalDensityUnits;
            }
            else if (rateUnit === 'Hour' && densityUnit === 'Days') {
                // Convert Days to Hours (Billable)
                amountCalc = rate * (totalDensityUnits * bHoursPerDay);
            }
            else if (rateUnit === 'Day' && densityUnit === 'Hours') {
                // Convert Hours to Days
                amountCalc = rate * (totalDensityUnits / bHoursPerDay);
            }
            else {
                // Fallback to strict hourly calc if units mismatch complexly
                // We already have `hours` (Total Contract Billable Hours).

                let hourlyRate = 0;
                if (rateUnit === 'Hour') hourlyRate = rate;
                if (rateUnit === 'Day') hourlyRate = rate / bHoursPerDay;
                if (rateUnit === 'Week') hourlyRate = rate / (bDaysPerWeek * bHoursPerDay); // ? Maybe risky

                amountCalc = hourlyRate * hours;
            }
        }

        amount = amountCalc;
        details = `${formatMoney(rate)}/${rateUnit} (${densityVal} ${densityUnit}/${densityFreq}) for ${duration} ${durationUnit}`;

    } else {
        // FLAT FEE logic
        amount = parseFloat(document.getElementById('c-flat-amount').value) || 0;
        const durVal = parseFloat(document.getElementById('c-flat-duration-val').value) || 1;
        const durUnit = document.getElementById('c-flat-duration-unit').value;

        // Calculate Total Working Hours available in this Duration
        let durWeeks = durVal;
        if (durUnit === 'Months') durWeeks = durVal * 4.33;

        const totalWorkingHoursAvailable = durWeeks * (profile.schedule.days || 4) * (profile.schedule.hours || 6);

        // Apply Billable Ratio to get Estimated Billable Hours
        hours = totalWorkingHoursAvailable * ratio;

        details = `Flat Fee / ${durVal} ${durUnit}`;
    }

    const contract = {
        id: crypto.randomUUID(),
        name,
        amount,
        hours,
        details
    };

    if (activeContractType === 'confirmed') {
        profile.calibrations.confirmed.push(contract);
    } else {
        profile.calibrations.projected.push(contract);
    }

    Store.saveIndependentProfile(profile);
    renderContracts();
    calculateGap();
    closeContractModal();
}

function validateSchedule(val, unit, freq, bHoursPerDay, bDaysPerWeek) {
    if (freq === 'Day') {
        if (unit === 'Hours' && val > bHoursPerDay) return false;
    }
    if (freq === 'Week') {
        if (unit === 'Days' && val > bDaysPerWeek) return false;
        // Check total hours per week too?
        // if (unit === 'Hours' && val > (bDaysPerWeek * bHoursPerDay)) return false; 
    }
    return true;
}

function removeContract(type, id) {
    if (type === 'confirmed') {
        profile.calibrations.confirmed = profile.calibrations.confirmed.filter(c => c.id !== id);
    } else {
        profile.calibrations.projected = profile.calibrations.projected.filter(c => c.id !== id);
    }
    Store.saveIndependentProfile(profile);
    renderContracts();
    calculateGap();
}

function renderContracts() {
    renderList(confirmedList, profile.calibrations.confirmed, 'confirmed');
    renderList(projectedList, profile.calibrations.projected, 'projected');

    const sumC = profile.calibrations.confirmed.reduce((s, c) => s + c.amount, 0);
    const sumP = profile.calibrations.projected.reduce((s, c) => s + c.amount, 0);

    outTotalConfirmed.textContent = formatMoney(sumC);
    outTotalProjected.textContent = formatMoney(sumP);
}

function renderList(container, items, type) {
    container.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'contract-list-item';
        div.innerHTML = `
            <div>
                <div style="font-weight:bold; font-size:0.9rem;">${item.name}</div>
                <div style="font-size:0.75rem; color:var(--color-text-muted);">${item.details}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="text-align:right;">
                    <div style="font-weight:bold;">${formatMoney(item.amount)}</div>
                    <div style="font-size:0.7rem; color:var(--color-text-muted);">~${Math.round(item.hours)}h dedicated</div>
                </div>
                <button onclick="removeContract('${type}', '${item.id}')" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
            </div>
        `;
        container.appendChild(div);
    });
}


/**
 * GAP ANALYSIS
 */
function calculateGap() {
    calculateGapAnalysis('now');
    calculateGapAnalysis('goal');
}

function calculateGapAnalysis(mode) {
    const val = parseFloat(inPeriodValue.value) || 1;
    const unit = inPeriodUnit.value;

    // 1. Calculate Period Multiplier
    let yearFraction = 1;
    if (unit === 'Months') yearFraction = val / 12;
    if (unit === 'Weeks') yearFraction = val / 52;
    if (unit === 'Years') yearFraction = val;

    // Determine Elements based on Mode
    const elTarget = document.getElementById(`out-period-target-${mode}`);
    const elLabel = document.getElementById(`out-period-label-${mode}`);
    const elGap = document.getElementById(`out-gap-${mode}`);
    const elRate = document.getElementById(`out-required-rate-${mode}`);

    if (elLabel) elLabel.textContent = `${val} ${unit}`;

    // 2. Annual Target Source
    let annualAmount = 0;
    if (mode === 'now') {
        annualAmount = (profile.goals && profile.goals.current) ? profile.goals.current : 0;
        // Fallback for Now? Current Net grossed up manually if missing? 
        // If missing, maybe 0 or try to calculate from currentNet.
        if (!annualAmount && profile.currentNetIncome) {
            const tax = profile.expenses.taxRate || 30;
            annualAmount = profile.currentNetIncome * (1 + (tax / 100));
        }
    } else {
        // Goal
        annualAmount = (profile.goals && profile.goals.gross) ? profile.goals.gross : 0;
        if (!annualAmount) {
            // Fallback
            const net = calculateTotalExpenses(profile);
            const tax = profile.expenses.taxRate || 30;
            annualAmount = net * (1 + (tax / 100));
        }
    }

    // 3. Period Target
    const periodTarget = annualAmount * yearFraction;

    // 4. Total Income (Confirmed + Projected)
    const sumC = profile.calibrations.confirmed.reduce((s, c) => s + c.amount, 0);
    const sumP = profile.calibrations.projected.reduce((s, c) => s + c.amount, 0);
    const totalIncome = sumC + sumP;

    // 5. Gap
    const gap = periodTarget - totalIncome;

    // 6. Remaining Capacity (Shared)
    const capacity = Utils.calculateBillableCapacity(profile);
    const annualBillableHours = capacity.totalBillableHours;
    const periodGrossCapacity = annualBillableHours * yearFraction;

    const usedHoursC = profile.calibrations.confirmed.reduce((s, c) => s + c.hours, 0);
    const usedHoursP = profile.calibrations.projected.reduce((s, c) => s + c.hours, 0);
    const remainingCapacity = periodGrossCapacity - (usedHoursC + usedHoursP);

    // 7. Rate
    // If Gap is negative (Surplus), Rate is irrelevant (or 0).
    const requiredRate = (gap > 0 && remainingCapacity > 0) ? (gap / remainingCapacity) : 0;

    // Render
    if (elTarget) elTarget.textContent = formatMoney(periodTarget);
    if (elGap) {
        elGap.textContent = formatMoney(gap);
        elGap.style.color = gap > 0 ? 'var(--color-text-error)' : 'green';
    }
    if (elRate) elRate.textContent = formatMoney(requiredRate) + '/hr';

    // Shared Capacity Message updates only once (or redundantly)
    if (outCapacityMsg) {
        outCapacityMsg.textContent = `${Math.round(remainingCapacity)} billable hours remaining (of ${Math.round(periodGrossCapacity)} total)`;
    }
}


// Copy helper from calibrations.js v1 or independent.js
function calculateTotalExpenses(prof) {
    if (!prof.expenses || !prof.expenses.items) return 0;
    return prof.expenses.items.reduce((sum, item) => {
        let annualAmt = 0;
        if (item.type === 'Monthly') annualAmt = item.amount * 12;
        else if (item.type === 'Annual') annualAmt = item.amount;
        else if (item.type === 'Periodic') annualAmt = item.amount * (item.frequency || 1);
        else if (item.type === 'Percent') annualAmt = item.amount || 0;
        return sum + annualAmt;
    }, 0);
}

// Global exposure
window.openContractModal = openContractModal;
window.closeContractModal = closeContractModal;
window.toggleMethod = toggleMethod;
window.saveContract = saveContract;
window.removeContract = removeContract;
window.handlePeriodChange = handlePeriodChange;

init();
