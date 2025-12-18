/**
 * Location Helper
 * Handles Country/State/City logic for Signup and Profile
 * Uses countriesnow.space API
 */
const LocationHelper = {
    // API Check: https://countriesnow.space/api/v0.1/countries
    apiBase: 'https://countriesnow.space/api/v0.1/countries',

    // Helpers
    fetchWithTimeout: async (resource, options = {}) => {
        const { timeout = 5000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    },

    loadStateCity: async (country, stateEl, cityEl, cityDatalist) => {
        // Clear downstream
        stateEl.innerHTML = '<option value="">Select State/Region...</option>';
        stateEl.parentElement.style.display = 'none'; // Hide by default

        cityEl.value = '';
        cityDatalist.innerHTML = '';
        cityEl.parentElement.style.display = 'none';

        if (!country) return;

        // Show State/City loaders
        cityEl.parentElement.style.display = 'block';

        // A. Fetch Cities (Populate Datalist)
        try {
            const res = await LocationHelper.fetchWithTimeout('https://countriesnow.space/api/v0.1/countries/cities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: country }),
                timeout: 4000 // 4s timeout
            });
            const data = await res.json();
            if (!data.error) {
                const cities = data.data;
                let opts = '';
                cities.slice(0, 1000).forEach(city => {
                    opts += `<option value="${city}">`;
                });
                cityDatalist.innerHTML = opts;
                cityEl.placeholder = `Search city in ${country}...`;
            } else {
                cityEl.placeholder = "Enter city manually";
            }
        } catch (e) {
            console.warn("City fetch failed (network/timeout):", e);
            cityEl.placeholder = "Enter city manually";
        }

        // B. Fetch States
        try {
            const res = await LocationHelper.fetchWithTimeout('https://countriesnow.space/api/v0.1/countries/states', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ country: country }),
                timeout: 4000
            });
            const data = await res.json();
            if (!data.error && data.data.states.length > 0) {
                stateEl.parentElement.style.display = 'block';
                let html = '<option value="">Select State/Region...</option>';
                data.data.states.forEach(s => {
                    html += `<option value="${s.name}">${s.name}</option>`;
                });
                stateEl.innerHTML = html;
            }
        } catch (e) {
            console.warn("State fetch failed (network/timeout):", e);
            // Keep hidden if failed
        }
    },

    init: async (countryEl, stateEl, cityEl, cityDatalist) => {
        if (!countryEl) return;

        // 0. Immediate Fallback (Prevents "Loading..." stuck state)
        const fallbackCountries = [
            "United States", "Canada", "United Kingdom", "Germany", "France",
            "Australia", "India", "China", "Brazil", "Mexico",
            "South Africa", "Nigeria", "Japan", "South Korea", "Italy", "Spain",
            "Afghanistan", "Argentina", "Belgium", "Chile", "Colombia", "Denmark",
            "Egypt", "Findland", "Greece", "Indonesia", "Iran", "Ireland", "Israel",
            "Kenya", "Malaysia", "Netherlands", "New Zealand", "Norway", "Pakistan",
            "Peru", "Philippines", "Poland", "Portugal", "Russia", "Saudi Arabia",
            "Singapore", "Sweden", "Switzerland", "Taiwan", "Thailand", "Turkey",
            "Ukraine", "United Arab Emirates", "Vietnam"
        ];
        fallbackCountries.sort();

        const renderFallback = () => {
            let html = '<option value="">Select Country</option>';
            fallbackCountries.forEach(c => {
                html += `<option value="${c}">${c}</option>`;
            });
            html += '<option value="Other">Other</option>';
            countryEl.innerHTML = html;
        };

        // Render immediately
        renderFallback();

        // 1. Load Countries from API (Progressive Enhancement)
        try {
            const res = await LocationHelper.fetchWithTimeout('https://countriesnow.space/api/v0.1/countries/iso', { timeout: 3000 });
            const data = await res.json();
            if (!data.error) {
                const countries = data.data;
                countries.sort((a, b) => a.name.localeCompare(b.name));
                let html = '<option value="">Select Country...</option>';
                countries.forEach(c => {
                    html += `<option value="${c.name}" data-iso="${c.iso2}">${c.name}</option>`;
                });
                // Success! Overwrite fallback
                countryEl.innerHTML = html;
            } else {
                // API error, keep fallback
                console.warn("Location API returned error, using fallback.");
            }
        } catch (e) {
            console.warn("Location API unreachable, keeping fallback.", e);
            // Do nothing, fallback is already rendered
        }

        // 2. Country Change Listener
        countryEl.addEventListener('change', async () => {
            await LocationHelper.loadStateCity(countryEl.value, stateEl, cityEl, cityDatalist);
        });
    }
};

window.LocationHelper = LocationHelper;
