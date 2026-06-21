/**
 * Reusable Autocomplete UI Component
 * Converts a standard text input into a tagging autocomplete input using a predefined library.
 */

window.Autocomplete = {
    /**
     * @param {string} containerId - The ID of the container element
     * @param {string} initialValue - The comma-separated initial values
     * @param {Array} library - The array of strings to use for autocomplete suggestions
     * @param {function} onChange - Callback function triggered when tags change: (newValueStr) => {}
     * @param {string} placeholder - Placeholder text for the input
     */
    init: function(containerId, initialValue, library, onChange, placeholder = "Type here...") {
        const container = document.getElementById(containerId);
        if (!container) return;

        let tags = [];
        if (initialValue) {
            tags = String(initialValue).split(',').map(t => t.trim()).filter(t => t);
        }
        const uniqueId = Math.random().toString(36).substr(2, 9);

        container.innerHTML = `
            <div class="tag-input-container">
                <div id="tags-wrapper-${uniqueId}" style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;"></div>
                <input type="text" id="tag-input-${uniqueId}" class="tag-input-field" placeholder="${placeholder}">
                <ul id="autocomplete-dropdown-${uniqueId}" class="autocomplete-dropdown"></ul>
            </div>
        `;

        const tagsWrapper = document.getElementById(`tags-wrapper-${uniqueId}`);
        const input = document.getElementById(`tag-input-${uniqueId}`);
        const dropdown = document.getElementById(`autocomplete-dropdown-${uniqueId}`);

        function renderTags() {
            tagsWrapper.innerHTML = '';
            tags.forEach((tag, idx) => {
                const chip = document.createElement('div');
                chip.className = 'tag-chip';
                chip.innerHTML = `<span>${tag}</span><span class="tag-chip-remove" data-idx="${idx}">&times;</span>`;
                tagsWrapper.appendChild(chip);
            });
            
            tagsWrapper.querySelectorAll('.tag-chip-remove').forEach(btn => {
                btn.onclick = (e) => {
                    const idx = parseInt(e.target.getAttribute('data-idx'));
                    tags.splice(idx, 1);
                    renderTags();
                    if (onChange) onChange(tags.join(', '));
                };
            });
        }

        function showDropdown(query) {
            const q = query.toLowerCase().trim();
            const available = library.filter(p => p.toLowerCase().includes(q) && !tags.includes(p));
            if (available.length === 0 || q === '') {
                dropdown.style.display = 'none';
                return;
            }
            dropdown.innerHTML = available.map(p => `<li class="autocomplete-item">${p}</li>`).join('');
            dropdown.style.display = 'block';

            dropdown.querySelectorAll('.autocomplete-item').forEach(li => {
                li.onclick = () => {
                    tags.push(li.innerText);
                    input.value = '';
                    dropdown.style.display = 'none';
                    renderTags();
                    if (onChange) onChange(tags.join(', '));
                    input.focus();
                };
            });
        }

        input.addEventListener('input', (e) => {
            const val = e.target.value;
            if (val.includes(',')) {
                const newTags = val.split(',').map(t => t.trim()).filter(t => t);
                tags.push(...newTags);
                input.value = '';
                dropdown.style.display = 'none';
                renderTags();
                if (onChange) onChange(tags.join(', '));
            } else {
                showDropdown(val);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.value.trim();
                if (val) {
                    tags.push(val);
                    input.value = '';
                    dropdown.style.display = 'none';
                    renderTags();
                    if (onChange) onChange(tags.join(', '));
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (container && !container.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Click on empty space inside container focuses input
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-input-container')) {
                input.focus();
            }
            // Show full dropdown when focused and empty
            if (e.target === input && input.value === '') {
                const available = library.filter(p => !tags.includes(p));
                if (available.length > 0) {
                    dropdown.innerHTML = available.map(p => `<li class="autocomplete-item">${p}</li>`).join('');
                    dropdown.style.display = 'block';
                    dropdown.querySelectorAll('.autocomplete-item').forEach(li => {
                        li.onclick = () => {
                            tags.push(li.innerText);
                            input.value = '';
                            dropdown.style.display = 'none';
                            renderTags();
                            if (onChange) onChange(tags.join(', '));
                            input.focus();
                        };
                    });
                }
            }
        });

        renderTags();
    }
};
