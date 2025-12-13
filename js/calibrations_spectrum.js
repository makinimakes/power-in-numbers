
/**
 * RATE SPECTRUM MODAL (Paired View)
 */
const modalSpectrum = document.getElementById('modal-spectrum');
const tableNow = document.getElementById('spectrum-table-now');
const tableGoal = document.getElementById('spectrum-table-goal');
const overheadList = document.getElementById('overhead-toggles-list');

// State for Overheads
let overheadProjects = [];
let selectedOverheadRate = 0; // Cumulative hourly rate to add
let cachedPersonalRateNow = 0;
let cachedPersonalRateGoal = 0;

// Spectrum Deltas: 10% to 90%
const DELTAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

async function openSpectrumModal() {
    console.log("openSpectrumModal called");
    // 1. Fetch Overheads (if not loaded)
    // We need to fetch projects where type = 'overhead' (or check expenses)
    // Actually, Store.getProjects() checks `projects` table.
    // We filter by `data->>type == 'business_overhead'` or similar marker used in independent tool.
    // In independent.html we used: profiles -> projects (via UUID?). 
    // Wait, Store.getProjects() gets everything for user.

    // Reset selection on open? Or persist? checking...
    // Let's reset for simplicity or persist if global "overheadProjects" array is kept.
    // We'll reload to be safe.

    try {
        console.log("Fetching overhead projects...");
        overheadProjects = await Store.getOverheadProjects();
        console.log("Overhead projects fetched:", overheadProjects.length);

        console.log("Fetching profile...");
        const profile = await Store.getIndependentProfile(); // Ensure fresh profile for Billable Hours
        console.log("Profile fetched");

        // (Filter step removed as getOverheadProjects handles it)

        // Calculate Hourly Rate for each Project
        const capacity = Utils.calculateBillableCapacity(profile);
        const billableHours = capacity.totalBillableHours || 1; // Avoid div/0

        overheadProjects.forEach(p => {
            // Calculate Cost
            let fixed = 0;
            let percent = 0;

            // Check p.expenses (flattened) OR p.data.expenses (if nested differently)
            // Store.getProjects flattens it, so p.expenses should work.
            const expenses = p.expenses || (p.data && p.data.expenses) || [];

            expenses.forEach(e => {
                const val = parseFloat(e.amount) || 0;
                if (e.type === 'Percent') percent += (e.baseAmount || val); // Access raw if needed
                else fixed += val;
            });

            // Additive Logic (Isolated Cost)
            let cost = 0;
            if (percent < 100) {
                cost = fixed / (1 - (percent / 100));
            }
            p.hourlyRate = cost / billableHours;
        });

        renderOverheadToggles();
        renderPairedSpectrum();
        if (modalSpectrum) {
            console.log("Showing modal...");
            modalSpectrum.showModal();
        } else {
            console.error("modalSpectrum element not found!");
        }
    } catch (err) {
        console.error("Error in openSpectrumModal:", err);
    }
}

function renderOverheadToggles() {
    if (!overheadList) return;
    overheadList.innerHTML = '';

    if (overheadProjects.length === 0) {
        overheadList.innerHTML = '<span style="color:#888; font-size:0.8rem;">No business profiles found.</span>';
        return;
    }

    overheadProjects.forEach(p => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '5px';
        label.style.fontSize = '0.9rem';
        label.style.cursor = 'pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = false; // Default off
        checkbox.dataset.rate = p.hourlyRate;

        checkbox.onchange = () => {
            recalculateSelectedOverhead();
            renderPairedSpectrum();
        };

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(`${p.name} (+$${Utils.formatCurrency(p.hourlyRate)}/hr)`));

        overheadList.appendChild(label);
    });
}

function recalculateSelectedOverhead() {
    selectedOverheadRate = 0;
    const checks = overheadList.querySelectorAll('input[type="checkbox"]');
    checks.forEach(c => {
        if (c.checked) {
            const r = parseFloat(c.dataset.rate);
            selectedOverheadRate += r;
        }
    });
}

function closeSpectrumModal() {
    if (modalSpectrum) modalSpectrum.close();
}

function renderPairedSpectrum() {
    // 1. Get Base Rates
    const parseRate = (id) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        const clean = el.textContent.replace(/[$,]/g, '').replace(/\/hr/g, '').trim();
        return parseFloat(clean) || 0;
    };

    const rateNowBase = parseRate('out-required-rate-now');
    const rateGoalBase = parseRate('out-required-rate-goal');

    // Apply Overhead
    const rateNow = rateNowBase + selectedOverheadRate;
    const rateGoal = rateGoalBase + selectedOverheadRate;

    // 2. Schedule
    const hoursPerDay = (profile.schedule && profile.schedule.hours) ? profile.schedule.hours : 6;
    const daysPerWeek = (profile.schedule && profile.schedule.days) ? profile.schedule.days : 4;

    // 3. Render Tables
    renderTable(tableNow, rateNow, hoursPerDay, daysPerWeek);
    renderTable(tableGoal, rateGoal, hoursPerDay, daysPerWeek);
}

function renderTable(tbody, baseRate, hpd, dpw) {
    if (!tbody) return;
    tbody.innerHTML = '';

    DELTAS.forEach(delta => {
        const multAug = 1 + delta;
        const multDisc = 1 - delta;

        // Augmentation Row
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';

        // 1. Augmented Rate Cell
        const tdAugRate = createRateCell(baseRate, multAug, hpd, dpw);
        tdAugRate.style.background = '#f6fff5'; // Light green

        // 2. Aug %
        const tdAugPct = document.createElement('td');
        tdAugPct.textContent = `${Math.round(multAug * 100)}%`;
        tdAugPct.style.textAlign = 'center';
        tdAugPct.style.fontWeight = 'bold';
        tdAugPct.style.background = '#e6fffa';

        // 3. Disc %
        const tdDiscPct = document.createElement('td');
        tdDiscPct.textContent = `${Math.round(multDisc * 100)}%`;
        tdDiscPct.style.textAlign = 'center';
        tdDiscPct.style.fontWeight = 'bold';
        tdDiscPct.style.background = '#fff5f5';

        // 4. Discounted Rate Cell
        const tdDiscRate = createRateCell(baseRate, multDisc, hpd, dpw);
        tdDiscRate.style.background = '#fff0eb'; // Light red

        tr.appendChild(tdAugRate);
        tr.appendChild(tdAugPct);
        tr.appendChild(tdDiscPct);
        tr.appendChild(tdDiscRate);

        tbody.appendChild(tr);
    });
}

function createRateCell(baseRate, multiplier, hpd, dpw) {
    const td = document.createElement('td');
    td.style.padding = '10px';
    td.style.textAlign = 'center';

    const hourly = baseRate * multiplier;
    const daily = hourly * hpd;
    const weekly = daily * dpw;

    // Format: $100/hr <br> <small>$600/day | $2400/wk</small>
    td.innerHTML = `
        <div style="font-weight:bold; font-size:1rem;">${Utils.formatCurrency(hourly)}/hr</div>
        <div style="font-size:0.75rem; color:#666; margin-top:2px;">
            ${Utils.formatCurrency(daily)}/day • ${Utils.formatCurrency(weekly)}/wk
        </div>
    `;
    return td;
}

// Event Listener Binding
// Event Listener Binding
function bindSpectrumBtn() {
    const btn = document.getElementById('btn-view-spectrum');
    if (btn) {
        console.log("Attached event listener to btn-view-spectrum");
        btn.onclick = openSpectrumModal; // Direct binding to avoid stacking listeners if run multiple times
    } else {
        console.warn("btn-view-spectrum not found");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSpectrumBtn);
} else {
    bindSpectrumBtn();
}

// Expose to window (fallback)
window.openSpectrumModal = openSpectrumModal;
window.closeSpectrumModal = closeSpectrumModal;
