/**
 * Logic for Meantime Steps Dashboard (NetPRIME)
 */

// UI References
const expensesList = document.getElementById('expenses-list');
const outSelectCount = document.getElementById('select-count');
const outCurrentNet = document.getElementById('out-current-net');
const outAdjustment = document.getElementById('out-adjustment');
const outNetPrime = document.getElementById('out-net-prime');

let profile = {};
let selectedItems = []; // Array of { id, currentVal, goalVal }

// Max selection limit
const MAX_SELECTION = 3;

async function init() {
    profile = await Store.getIndependentProfile();

    // Init state from profile if it exists (TO DO: Add persistence later if needed)
    // For now, ephemeral state or check if we want to save 'meantimeSelections'

    renderList();
    updateCalculations();
}

/**
 * Handle checkbox selection
 */
function toggleSelection(index) {
    const item = profile.expenses.items[index];
    const exists = selectedItems.find(s => s.id === item.id);

    if (exists) {
        // Deselect
        selectedItems = selectedItems.filter(s => s.id !== item.id);
    } else {
        // Select logic
        if (selectedItems.length >= MAX_SELECTION) {
            alert(`You can only select up to ${MAX_SELECTION} items for Meantime planning.`);
            // Revert checkbox explicitly is handled by re-render
        } else {
            // Add new selection with defaults
            // Default Current: Whatever is in the main profile (normalized to monthly for consistency? Or kept as input?)
            // The prompt says: "enter a current amount that they pay... Then, they should enter the amount that they would like to spend"
            // We'll initialize with the profile amount as a suggestion.
            const amount = parseFloat(item.amount) || 0;

            selectedItems.push({
                id: item.id,
                currentVal: amount,
                goalVal: amount // Default goal = current
            });
        }
    }
    renderList();
    updateCalculations();
}

/**
 * Handle Input Changes
 */
function handleInputChange(id, field, value) {
    const sel = selectedItems.find(s => s.id === id);
    if (sel) {
        sel[field] = parseFloat(value) || 0;
        updateCalculations();
    }
}

/**
 * Main Calculation: NetPRIME
 * NetPRIME = Current Net + Sum(GoalDiff)
 * GoalDiff = (Goal - Current) * Frequency
 * The request says "adjustment of Current Net Income to a Current NetPRIME Income"
 * Since Current Net is Annual, we should generate Annual Differences.
 */
function updateCalculations() {
    const currentNet = profile.currentNetIncome || 0;
    outCurrentNet.textContent = Utils.formatCurrency(currentNet);

    let totalAdjustmentAnnual = 0;

    selectedItems.forEach(sel => {
        // Find metadata for frequency
        const originalItem = profile.expenses.items.find(i => i.id === sel.id);
        const freqMult = getFrequencyMultiplier(originalItem);

        const currentAnnual = sel.currentVal * freqMult;
        const goalAnnual = sel.goalVal * freqMult;

        totalAdjustmentAnnual += (goalAnnual - currentAnnual);
    });

    // Adjustment Display
    const sign = totalAdjustmentAnnual >= 0 ? '+' : '';
    outAdjustment.textContent = sign + Utils.formatCurrency(totalAdjustmentAnnual);

    // NetPRIME
    const netPrime = currentNet + totalAdjustmentAnnual;
    outNetPrime.textContent = Utils.formatCurrency(netPrime);

    // Update Count UI
    outSelectCount.textContent = `${selectedItems.length}/${MAX_SELECTION} selected`;
}

function getFrequencyMultiplier(item) {
    if (!item) return 1;
    if (item.type === 'Monthly' || item.type === 'Percent') return 12; // Assuming percent inputs are treated as monthly amounts roughly? Or just 12x? Usually user inputs "Amount" in list.
    if (item.type === 'Periodic') return parseFloat(item.frequency) || 1;
    return 1;
}

function renderList() {
    expensesList.innerHTML = '';

    (profile.expenses.items || []).forEach((item, index) => {
        const isSelected = selectedItems.some(s => s.id === item.id);
        const selectionData = selectedItems.find(s => s.id === item.id);

        const row = document.createElement('div');
        row.className = `expense-row ${isSelected ? 'selected' : ''}`;

        // Frequency Label
        let freqText = '';
        if (item.type === 'Monthly' || item.type === 'Percent') freqText = 'Monthly';
        else if (item.type === 'Periodic') freqText = `${item.frequency} times per year`;
        else freqText = 'Annually';

        // Checkbox + Label Area
        const leftHtml = `
            <div style="display:flex; align-items:center; gap:10px; flex-grow:1;">
                <input type="checkbox" 
                    ${isSelected ? 'checked' : ''} 
                    onchange="toggleSelection(${index})"
                    style="transform: scale(1.2); cursor:pointer;">
                <div>
                    <div style="font-weight:bold; font-size:0.9rem;">${item.label}</div>
                    <div style="font-size:0.7rem; color:var(--color-text-muted);">
                        ${freqText}
                    </div>
                </div>
            </div>
        `;

        // Inputs Area (Only if selected)
        let rightHtml = '';
        if (isSelected && selectionData) {
            rightHtml = `
                <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-size:0.7rem; color:#777;">Pay Now:</span>
                        <input type="number" 
                            style="width:80px; text-align:right; font-size:0.9rem; padding:2px;"
                            value="${selectionData.currentVal}"
                            onchange="handleInputChange('${item.id}', 'currentVal', this.value)">
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        <span style="font-size:0.7rem; color:#777;">Goal:</span>
                        <input type="number" 
                            style="width:80px; text-align:right; font-size:0.9rem; padding:2px; border-color:var(--color-primary);"
                            value="${selectionData.goalVal}"
                            onchange="handleInputChange('${item.id}', 'goalVal', this.value)">
                    </div>
                </div>
            `;
        } else {
            // Just show standard amount if not selected
            rightHtml = `<div style="color:#aaa;">${Utils.formatCurrency(parseFloat(item.amount) || 0)}</div>`;
        }

        row.innerHTML = leftHtml + rightHtml;
        expensesList.appendChild(row);
    });
}

// Utils alias if needed (but Utils matches logic_utils from other files)
function formatMoney(num) {
    return Utils.formatCurrency(num);
}

// Global Exports
window.toggleSelection = toggleSelection;
window.handleInputChange = handleInputChange;

init();
