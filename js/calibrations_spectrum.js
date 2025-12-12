
/**
 * RATE SPECTRUM MODAL (Paired View)
 */
const modalSpectrum = document.getElementById('modal-spectrum');
const tableNow = document.getElementById('spectrum-table-now');
const tableGoal = document.getElementById('spectrum-table-goal');

// Spectrum Deltas: 10% to 90%
const DELTAS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

function openSpectrumModal() {
    renderPairedSpectrum();
    if (modalSpectrum) modalSpectrum.showModal();
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

    const rateNow = parseRate('out-required-rate-now');
    const rateGoal = parseRate('out-required-rate-goal');

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

// Expose to window
window.openSpectrumModal = openSpectrumModal;
window.closeSpectrumModal = closeSpectrumModal;
