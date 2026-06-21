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
        try {
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
                const available = (library || []).filter(p => p.toLowerCase().includes(q) && !tags.includes(p));
                if (available.length === 0 || q === '') {
                    dropdown.style.display = 'none';
                    return;
                }
                dropdown.innerHTML = '';
                available.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = item;
                    li.className = 'autocomplete-item';
                    li.onclick = () => {
                        tags.push(item);
                        renderTags();
                        input.value = '';
                        dropdown.style.display = 'none';
                        if (onChange) onChange(tags.join(', '));
                        input.focus();
                    };
                    dropdown.appendChild(li);
                });
                dropdown.style.display = 'block';
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
                    if (input.value.trim() !== '') {
                        tags.push(input.value.trim());
                        renderTags();
                        input.value = '';
                        dropdown.style.display = 'none';
                        if (onChange) onChange(tags.join(', '));
                    }
                }
                if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
                    tags.pop();
                    renderTags();
                    if (onChange) onChange(tags.join(', '));
                }
            });

            document.addEventListener('click', (e) => {
                if (container && !container.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });

            container.addEventListener('click', (e) => {
                if (e.target !== input && !e.target.classList.contains('tag-chip-remove')) {
                    input.focus();
                }
            });

            renderTags();
        } catch (error) {
            console.error("Autocomplete.init failed for", containerId, ":", error);
            // Graceful fallback: render a plain input
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `<input type="text" value="${initialValue || ''}" placeholder="${placeholder}" style="width:100%; padding:5px;">`;
                const fallbackInput = container.querySelector('input');
                fallbackInput.onchange = (e) => {
                    if (onChange) onChange(e.target.value);
                };
            }
        }
    }
};
