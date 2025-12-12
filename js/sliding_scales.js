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

async function init() {
    // Load data
    profile = await Store.getIndependentProfile();

    // If profile is empty or default not fully populated yet (race condition?), handle gracefully
    if (!profile.expenses) profile.expenses = { items: [] };

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
            currentAmt = ((dreamPercent / 100) * (profile.currentNetIncome || 0)) / divider;
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

function checkAllLocked() {
    const unlockedCount = expenseState.filter(i => !i.locked).length;
    // We could show a visual cue if unlockedCount === 0
    // But per user request "global effect", simply ensuring the math works is key.
}

function resetLocks() {
    expenseState.forEach(item => item.locked = false);

    // Recalculate using original profile income
    recalculateUnlocked(profile.currentNetIncome || 0);
    renderExpenses();
}

function toggleLock(index) {
    const willBeLocked = !expenseState[index].locked;
    expenseState[index].locked = willBeLocked;

    recalculateWithLocks(profile.currentNetIncome || 0);
    renderExpenses();
}

function handleAmountChange(index, newAmount) {
    // STANDARD MODE CHANGE
    expenseState[index].amount = newAmount;
    expenseState[index].locked = true; // Implicit lock

    // Recalculate
    recalculateWithLocks(profile.currentNetIncome || 0);

    // Update global calculation display (manually since we messed with state)
    updateCalculations();
    renderExpenses();
}

/**
 * Core Logic: Lock & Rescale
 */
function recalculateWithLocks(totalIncome) {
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
    const totalAllocated = expenseState.reduce((sum, item) => sum + (item.amount * item.divider), 0);
    outTotalAllocated.textContent = formatMoney(totalAllocated);

    // Recalibrated Values - In pure "Lock" mode, this usually just matches Current Net 
    // unless we allow "Squeezing" (where locks exceed income).
    // For now, it stays as Current Net because we aren't driving it.
    // outRecalibratedNet.textContent = formatMoney(profile.currentNetIncome || 0);

    // Gross
    // Gross (Match logic from independent.js: Net * (1 + TaxRate))
    const taxRate = (profile.expenses && profile.expenses.taxRate) ? parseFloat(profile.expenses.taxRate) / 100 : 0.3;
    const gross = (profile.currentNetIncome || 0) * (1 + taxRate);
    outRecalibratedGross.textContent = formatMoney(gross);
}

function renderExpenses() {
    expensesList.innerHTML = '';

    expenseState.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = `expense-row ${item.locked ? 'locked' : ''}`;

        let freqText = '';
        if (item.type === 'Monthly' || item.type === 'Percent') freqText = 'Monthly';
        else if (item.type === 'Periodic') freqText = `${item.frequency} times per year`;
        else freqText = 'Annually';

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
                        value="${Math.round(item.amount)}" 
                        onchange="handleAmountChange(${index}, parseFloat(this.value))"
                        style="text-align:right; width:100%;">
                </div>
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

init();
