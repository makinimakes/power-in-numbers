/**
 * Logic for Sliding Scales Dashboard
 * "Lock & Rescale"
 */

// Initialize
// Initialize
const expensesList = document.getElementById('expenses-list');
const btnReset = document.getElementById('btn-reset');
const outTotalAllocated = document.getElementById('out-total-allocated');
const outRecalibratedNet = document.getElementById('out-recalibrated-net');
const outRecalibratedGross = document.getElementById('out-recalibrated-gross');

let profile = {}; // Init empty

// Local state
let expenseState = [];
let driverIndex = -1; // -1 means no driver (Fixed Income Mode)
let currentDrivenNet = 0; // The calculated Net Income
let currentDriverOverride = 0; // The user's manual input for the driver

async function init() {
    // Load data
    profile = await Store.getIndependentProfile();

    // If profile is empty or default not fully populated yet (race condition?), handle gracefully
    if (!profile.expenses) profile.expenses = { items: [] };

    currentDrivenNet = profile.currentNetIncome || 0;

    // 1. Calculate Goal Net (Total) based on Main Profile to determine percentages
    let fixedSum = 0;
    let percentSum = 0;
    (profile.expenses.items || []).forEach(item => {
        const amount = parseFloat(item.amount) || 0;
        if (item.type === 'Monthly') fixedSum += amount * 12;
        else if (item.type === 'Periodic') fixedSum += amount * (parseFloat(item.frequency) || 1);
        else if (item.type === 'Percent') percentSum += amount;
    });

    // Goal Net = Fixed / (1 - Percent/100)
    let dreamGoalNet = 0;
    if (percentSum < 100) {
        dreamGoalNet = fixedSum / (1 - (percentSum / 100));
    }

    // 2. Build Expense State merging Dream Percentages with Saved Locks
    const savedState = (profile.slidingScalePercentages && profile.slidingScalePercentages.items) ? profile.slidingScalePercentages.items : [];

    expenseState = (profile.expenses.items || []).map(item => {
        // Calculate Baseline Annual Amount
        let annualAmt = 0;
        const amount = parseFloat(item.amount) || 0;
        if (item.type === 'Monthly') annualAmt = amount * 12;
        else if (item.type === 'Periodic') annualAmt = amount * (parseFloat(item.frequency) || 1);
        else if (item.type === 'Percent') annualAmt = (amount / 100) * dreamGoalNet;

        // Calculate Dream Percent (Annual basis)
        const dreamPercent = dreamGoalNet > 0 ? (annualAmt / dreamGoalNet) * 100 : 0;

        // Check for existing lock state
        const saved = savedState.find(s => s.id === item.id);
        const isLocked = saved ? saved.locked : false;

        // Determine Divider for Display
        let divider = 1;
        if (item.type === 'Monthly' || item.type === 'Percent') divider = 12;
        else if (item.type === 'Periodic') divider = parseFloat(item.frequency) || 1;

        // If locked, keep saved amount. If unlocked, use new Dream Percent * Current Net
        let currentAmt = 0;
        if (isLocked && saved) {
            currentAmt = saved.amount;
        } else {
            // Annual Share = (Percent * CurrentNet)
            // Display Amount = Annual Share / Divider
            currentAmt = ((dreamPercent / 100) * currentDrivenNet) / divider;
        }

        return {
            ...item,
            percent: dreamPercent.toFixed(2), // Original Dream Percent (of Annual)
            amount: currentAmt, // DISPLAY Amount (Monthly/Periodic)
            locked: isLocked,
            divider: divider
        };
    });

    renderExpenses();
    updateCalculations();

    // Listeners
    if (btnReset) btnReset.addEventListener('click', resetLocks);
}

function resetLocks() {
    expenseState.forEach(item => item.locked = false);
    driverIndex = -1; // Reset driver
    currentDrivenNet = profile.currentNetIncome || 0;

    // Recalculate using original profile income
    recalculateUnlocked(currentDrivenNet);
    renderExpenses();
}

function toggleLock(index) {
    // If we have an active driver, locking another item just holds it at current value
    const willBeLocked = !expenseState[index].locked;
    expenseState[index].locked = willBeLocked;

    // If we just LOCK the active driver, disable driver mode for it
    // "if a line... selects the unlock icon (toggles lock), it should immediately unregister as chart"
    // Wait, the user said "selects the unlock icon" -> unregister. 
    // Usually "Unlock Icon" means "Make it Unlocked". 
    // But our button is a toggle.
    // If it is currently Driver, it is implicitly UNLOCKED (per our new logic).
    // So the button shows '🔓'. Clicking it locks it '🔒'.
    // User said: "if a line has selected the chart icon, and then selects the unlock icon..."
    // If they mean clicking the lock button (which is currently open):
    if (driverIndex === index) {
        driverIndex = -1;
        // It becomes a standard locked item at its current override value
        expenseState[index].amount = currentDriverOverride;
        expenseState[index].locked = true;
    }

    recalculateWithLocks(profile.currentNetIncome || 0, index);
    renderExpenses();
}

function toggleDriver(index) {
    if (driverIndex === index) {
        // Deactivate Driver
        driverIndex = -1;
    } else {
        // Activate Driver
        driverIndex = index;
        // User Rule: Immediately unlock
        expenseState[index].locked = false;

        // Init override with current value
        currentDriverOverride = expenseState[index].amount;
    }

    // Recalculate "Natural" state for everyone (since this item is now Unlocked)
    recalculateWithLocks(profile.currentNetIncome || 0, index);
    renderExpenses();
}

function handleAmountChange(index, newAmount) {
    // Logic Branch: Driver vs. Squeeze
    if (driverIndex === index) {
        // DRIVER MODE CHANGE
        currentDriverOverride = newAmount;
        // Ensure unlocked
        expenseState[index].locked = false;

        // Recalculate natural state of list
        recalculateWithLocks(profile.currentNetIncome || 0, index);

    } else {
        // STANDARD MODE CHANGE
        expenseState[index].amount = newAmount;
        expenseState[index].locked = true; // Implicit lock

        // Recalculate
        recalculateWithLocks(profile.currentNetIncome || 0, index);
    }
    // Update global calculation display (manually since we messed with state)
    updateCalculations();
    renderExpenses();
}

/**
 * Core Logic: Lock & Rescale
 */
function recalculateWithLocks(totalIncome, changedIndex) {
    // 1. Sum Locked Amounts (ANNUALIZED)
    const lockedTotal = expenseState.reduce((sum, item) => item.locked ? sum + (item.amount * item.divider) : sum, 0);

    // 2. Remaining Income (Annual)
    const remainingIncome = totalIncome - lockedTotal;

    // 3. Sum of Original Percentages of UNLOCKED items
    const unlockedPercentSum = expenseState.reduce((sum, item) => !item.locked ? sum + parseFloat(item.percent) : sum, 0);

    if (unlockedPercentSum <= 0) return; // Avoid divide by zero

    // 4. Distribute Remaining Income to Unlocked Items
    expenseState.forEach(item => {
        if (!item.locked) {
            // Annual Share = (My Percent / Unlocked Percent Pool) * Remaining Income
            const annualShare = (parseFloat(item.percent) / unlockedPercentSum) * remainingIncome;

            // Display Amount = Annual Share / Divider
            item.amount = annualShare / item.divider;
        }
    });

    updateCalculations();
}

function recalculateUnlocked(totalIncome) {
    // Helper to reset to pure percent based
    expenseState.forEach(item => {
        if (!item.locked) {
            const annualShare = (parseFloat(item.percent) / 100) * totalIncome;
            item.amount = annualShare / item.divider;
        }
    });
    updateCalculations();
}

function updateCalculations() {
    // 1. Total Allocated (In standard list)
    // For the list, the Driver is "Natural" (part of the unlocked pool). 
    // If we want "Total Allocated" to reflect the "CurrentNet" reality, we sum the natural amounts.
    // If we want it to reflect the "Recalibrated" reality, we'd sum recalibrated amounts.
    // Given the list visuals show Natural for others, Total Allocated should likely be Natural Sum (should close to CurrentNet).
    const totalAllocated = expenseState.reduce((sum, item) => sum + (item.amount * item.divider), 0);
    outTotalAllocated.textContent = formatMoney(totalAllocated);

    // 2. Recalibrated Values (Sidebar)
    // Only affected by Driver
    if (driverIndex !== -1) {
        const item = expenseState[driverIndex];

        // Explicitly calculate Baseline vs New
        const originalBaseAnnual = (parseFloat(item.percent) / 100) * (profile.currentNetIncome || 0);
        const newDriverAnnual = currentDriverOverride * item.divider;

        // Additive Delta
        const delta = newDriverAnnual - originalBaseAnnual;

        // New Net = Current + Delta
        currentDrivenNet = (profile.currentNetIncome || 0) + delta;

    } else {
        currentDrivenNet = profile.currentNetIncome || 0;
    }

    outRecalibratedNet.textContent = formatMoney(currentDrivenNet);

    // Gross
    const taxRate = (profile.expenses && profile.expenses.taxRate) ? parseFloat(profile.expenses.taxRate) / 100 : 0.3;
    const gross = currentDrivenNet / (1 - taxRate);
    outRecalibratedGross.textContent = formatMoney(gross);
}

function renderExpenses() {
    expensesList.innerHTML = '';

    expenseState.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `expense-row ${item.locked ? 'locked' : ''}`;

        if (index === driverIndex) {
            row.style.background = 'var(--color-bg-subtle)';
            row.style.borderLeft = '4px solid var(--color-primary)';
        }

        let freqText = '';
        if (item.type === 'Monthly' || item.type === 'Percent') freqText = 'Monthly';
        else if (item.type === 'Periodic') freqText = `${item.frequency} times per year`;
        else freqText = 'Annually';

        // DISPLAY VALUE DETERMINATION
        // If this is the driver, show the Override value.
        // Otherwise, show the computed `item.amount`.
        const displayValue = (index === driverIndex) ? currentDriverOverride : item.amount;

        row.innerHTML = `
            <div style="flex-grow:1;">
                <div style="font-weight:bold; font-size:0.9rem;">${item.label}</div>
                <div style="font-size:0.7rem; color:var(--color-text-muted);">
                    ${freqText} • ${item.percent}% baseline
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:5px;">
                <div style="width: 100px;">
                    <input type="number" 
                        value="${Math.round(displayValue)}" 
                        onchange="handleAmountChange(${index}, parseFloat(this.value))"
                        style="text-align:right; width:100%;">
                </div>
                <!-- Driver Button -->
                <button onclick="toggleDriver(${index})" 
                    title="Recalculate Total Income to account for increased expense"
                    style="background:none; border:1px solid transparent; cursor:pointer; padding:5px; border-radius:4px; ${driverIndex === index ? 'background:var(--color-bg-subtle); border-color:var(--color-primary);' : 'opacity:0.6;'}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 20V10M12 20V4M6 20v-6" />
                    </svg>
                </button>
                <!-- Lock Button -->
                <button onclick="toggleLock(${index})" style="background:none; border:none; cursor:pointer;">
                    ${item.locked ? '🔒' : '🔓'}
                </button>
            </div>
        `;

        expensesList.appendChild(row);
    });
}

// Global scope exposure
window.handleAmountChange = handleAmountChange;
window.toggleLock = toggleLock;
window.toggleDriver = toggleDriver;

init();
