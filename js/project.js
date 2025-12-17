console.log("PROJECT.JS LOADED");
/**
 * Power in Numbers - Project Dashboard Logic
 * Robust Version (Refactored)
 */
// alert("Project JS Loaded - Rebuilt"); // Debug Alert removed for Prod

// --- 1. BudgetEngine is imported from budget_engine.js ---

// --- 1.5 Wizard UI Logic ---
const Wizard = {
    // V69: PRODUCTION MODE (Reloads Enabled)
    DEBUG_NO_RELOAD: false,
    project: null,
    pendingConfirm: null,

    init: async () => {
        // ALERT TO CONFIRM VERSION
        // alert("DEBUG: V68 SCRIPT LOADED. HTML Fixes Applied.");
    },
    state: { type: null, isTimeBased: false, fixedType: null },

    open: (phaseId) => {
        Wizard.state = { type: null, isTimeBased: false, fixedType: null };
        const modal = document.getElementById('modal-line-item-wizard');
        if (!modal) return;
        modal.setAttribute('data-phase-id', phaseId);
        modal.removeAttribute('data-edit-id'); // Clear edit mode
        modal.style.display = 'block';

        document.querySelectorAll('#modal-line-item-wizard input').forEach(i => i.value = '');
        document.getElementById('wiz-assignee').value = '';
        const overheadSel = document.getElementById('wiz-overhead-select');
        if (overheadSel) overheadSel.innerHTML = '<option>Loading...</option>';

        Wizard.showStep('wizard-step-1');
        ['wizard-step-percent', 'wizard-step-flat-type', 'wizard-step-fixed-struct',
            'wizard-step-lump', 'wizard-step-unit', 'wizard-step-time', 'wizard-step-overhead']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        document.getElementById('btn-wizard-finish').style.display = 'none';

        Wizard.populateAssignees();
    },

    populateAssignees: () => {
        const select = document.getElementById('wiz-assignee');
        const project = Wizard.project || window._project;
        if (!select || !project) return;
        let html = '<option value="">(None / General Project)</option>';
        if (project.teamMembers) {
            project.teamMembers.forEach(m => {
                const name = m.name || m.username || m.email;
                html += `<option value="${m.email || m.username}">${name}</option>`;
            });
        }
        select.innerHTML = html;
    },

    populateOverheads: async () => {
        const select = document.getElementById('wiz-overhead-select');
        if (!select) return;
        try {
            const projects = await Store.getOverheadProjects();
            let html = '<option value="">-- Select Profile --</option>';
            (projects || []).forEach(p => {
                const total = (p.expenses || []).reduce((sum, e) => sum + BudgetEngine.safeFloat(e.amount), 0);

                html += `<option value="${p.id}" data-total="${total}">${p.name} ($${total.toLocaleString()}/yr)</option>`;
            });
            select.innerHTML = html;
        } catch (e) {
            select.innerHTML = '<option>Error loading profiles</option>';
        }
    },

    setImportMode: () => {
        Wizard.state.type = 'Import';
        Wizard.showStep('wizard-step-overhead');
        Wizard.populateOverheads();
        document.getElementById('btn-wizard-finish').style.display = 'inline-block';
    },

    setType: (t) => {
        Wizard.state.type = t;
        if (t === 'Percentage') {
            Wizard.showStep('wizard-step-percent');
            document.getElementById('btn-wizard-finish').style.display = 'inline-block';
        } else {
            Wizard.showStep('wizard-step-flat-type');
        }
    },

    setTimeBased: (isTime) => {
        Wizard.state.isTimeBased = isTime;
        if (isTime) {
            Wizard.showStep('wizard-step-time');
            document.getElementById('btn-wizard-finish').style.display = 'inline-block';
        } else {
            Wizard.showStep('wizard-step-fixed-struct');
        }
    },

    setFixedType: (ft) => {
        Wizard.state.fixedType = ft;
        if (ft === 'Lump') {
            Wizard.showStep('wizard-step-lump');
        } else {
            const btnOverhead = document.getElementById('wizard-btn-add-overhead');
            if (btnOverhead) btnOverhead.style.display = 'none'; // Hide Overhead button for Expenses
            Wizard.showStep('wizard-step-unit');
        }
        document.getElementById('btn-wizard-finish').style.display = 'inline-block';
    },

    showStep: (id) => {
        document.getElementById(id).style.display = 'block';
    },

    // V131: Detailed Schedule Calculator
    toggleCalculator: (e) => {
        if (e) e.preventDefault();
        const el = document.getElementById('wiz-time-calc');
        if (el) {
            el.style.display = (el.style.display === 'none') ? 'block' : 'none';
        }
    },

    calcDetailedSchedule: () => {
        const hpd = parseFloat(document.getElementById('wiz-calc-hpd').value) || 0;
        const dpw = parseFloat(document.getElementById('wiz-calc-dpw').value) || 0;
        const wks = parseFloat(document.getElementById('wiz-calc-wks').value) || 0;

        const totalHours = hpd * dpw * wks;

        // Update UI
        document.getElementById('wiz-calc-total').innerText = totalHours;

        // Auto-fill Main Wizard Inputs
        if (totalHours > 0) {
            document.getElementById('wiz-time-duration').value = totalHours;
            document.getElementById('wiz-time-unit').value = 'Hours'; // Force unit

            // V132: Save Metadata for Display
            Wizard.state.calcDetails = { hpd, dpw, wks };
        } else {
            Wizard.state.calcDetails = null;
        }
    },

    // Updated: Inline Add (No Wizard)
    openForMember: async (phaseId, memberId) => {
        // 1. Get Project & Member Profile
        const project = Wizard.project || window._project;
        if (!project) return alert("Project data missing");
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase) return alert("Phase not found");

        const usersMap = Wizard.usersMap || window._usersMap;
        const user = usersMap ? usersMap[memberId] : null;
        const profile = user ? user.independentProfile : {};
        const userName = user ? (user.name || user.username) : 'Collaborator';

        // 2. Calculate Defaults
        // Rate: Use Goal Rate if available, else 50
        const rates = window.BudgetEngine.getWorkerRates(profile);
        const rate = rates.goal > 0 ? rates.goal.toFixed(2) : "50.00";

        // Schedule: Use Profile Schedule if available
        // logic: Count = Weeks, Duration = Hours/Week
        let weeks = 1;
        let hours = 40;
        if (profile.schedule) {
            let weeks = BudgetEngine.safeFloat(profile.schedule.weeks) || 50;
            hours = BudgetEngine.safeFloat(profile.schedule.hours) || 40;

        }

        // 3. Create Item
        const item = {
            id: 'li-' + Date.now(),
            name: user && user.role ? user.role : 'Collaborator',
            assignee: memberId,
            itemType: 'Labor',
            method: 'Time',

            // V87: Defaults
            rateMode: 'phase', // Default to Conform to Phase Pay Rate
            rate: rate, // Fallback value, but mode takes precedence

            schedMode: 'curbed', // Default to Curb by Worker Capacity
            unit: 'Hours',
            duration: hours, // Fallback value
            count: weeks // Fallback value
        };

        // 4. Save
        if (!phase.lineItems) phase.lineItems = [];
        phase.lineItems.push(item);
        await Store.saveProject(project);

        // Reload to show added item
        location.reload();
    },

    edit: (itemId) => {
        let phaseId = null;
        let item = null;
        if (window._project && window._project.phases) {
            for (let p of window._project.phases) {
                if (p.lineItems) {
                    const found = p.lineItems.find(i => i.id === itemId);
                    if (found) {
                        item = found;
                        phaseId = p.id;
                        break;
                    }
                }
            }
        }
        if (!item || !phaseId) return alert("Item not found");

        Wizard.open(phaseId);
        document.getElementById('modal-line-item-wizard').setAttribute('data-edit-id', itemId);

        document.getElementById('wiz-name').value = item.name;
        document.getElementById('wiz-assignee').value = item.assignee || '';

        if (item.method === 'Percentage') {
            Wizard.setType('Percentage');
            document.getElementById('wiz-percent').value = item.percent;
        } else if (item.name && item.name.startsWith('Overhead:')) {
            Wizard.setType('Flat');
            Wizard.setTimeBased(true);
            Wizard.showStep('wizard-step-time');
            document.getElementById('wiz-time-count').value = item.count;
            document.getElementById('wiz-time-duration').value = item.duration;
            document.getElementById('wiz-time-rate').value = item.rate;
            document.getElementById('wiz-time-unit').value = item.unit;
            document.getElementById('btn-wizard-finish').style.display = 'inline-block';
        } else if (item.method === 'Time') {
            Wizard.setType('Flat');
            Wizard.setTimeBased(true);
            document.getElementById('wiz-time-count').value = item.count;
            document.getElementById('wiz-time-duration').value = item.duration;
            document.getElementById('wiz-time-unit').value = item.unit || 'Hours';
            document.getElementById('wiz-time-rate').value = item.rate;

            // V133: Repopulate Calculator if data exists
            if (item.schedDetails) {
                const { hpd, dpw, wks } = item.schedDetails;
                document.getElementById('wiz-calc-hpd').value = hpd;
                document.getElementById('wiz-calc-dpw').value = dpw;
                document.getElementById('wiz-calc-wks').value = wks;
                document.getElementById('wiz-time-calc').style.display = 'block';
                Wizard.calcDetailedSchedule(); // Update total display
                Wizard.state.calcDetails = item.schedDetails; // Prime state
            } else {
                document.getElementById('wiz-time-calc').style.display = 'none';
                Wizard.state.calcDetails = null;
            }
        } else {
            Wizard.setType('Flat');
            Wizard.setTimeBased(false);
            if (item.method === 'LumpSum') {
                Wizard.setFixedType('Lump');
                document.getElementById('wiz-lump-amount').value = item.amount;
            } else if (item.method === 'Unit') {
                Wizard.setFixedType('Unit');
                document.getElementById('wiz-unit-qty').value = item.count || 1;
                document.getElementById('wiz-unit-cost').value = item.rate;
            }
        }
    },

    deleteLineItem: async (phaseId, itemId) => {
        // Quick Delete without confirm for checkbox toggle experience?
        // User asked for "Select/Deselect" experience.
        if (!confirm("Remove this item from the phase?")) return;

        console.log("Deleting Item:", phaseId, itemId);

        const project = Wizard.project || window._project;
        if (!project) return;
        const phase = project.phases.find(p => p.id === phaseId);
        if (phase) {
            phase.lineItems = phase.lineItems.filter(i => i.id !== itemId);
            console.log("Deleted. Saving...");
            await Store.saveProject(project);
            location.reload();
        }
    },

    // Toggle All Helper
    togglePhaseMembers: async (phaseId, selectAll) => {
        const project = Wizard.project || window._project;
        const phase = project.phases.find(p => p.id === phaseId);
        if (!phase || !project.teamMembers) return;

        // 1. If Select All: Add missing members
        if (selectAll) {
            let changed = false;
            if (!phase.lineItems) phase.lineItems = [];

            // Get Caps
            const project = window.Wizard.project || window._project;
            const minW = parseFloat(project.globalRates ? project.globalRates.minWage : 0) || 0;
            const maxW = parseFloat(project.globalRates ? project.globalRates.maxWage : 9999) || 9999;

            for (let m of project.teamMembers) {
                // AUTO-ADD DISABLED:
                // We should not force-add every team member to every phase automatically on render.
                // This breaks the "Delete Item" feature.
                // Instead, items should only be added if specifically requested or on initial setup.
                // But for now, to fix the regression, we just comment out this loop's body or make it stricter?
                // Strict fix: Do nothing here.
            }
            if (changed) {
                await Store.saveProject(project);
                location.reload();
            }
        } else {
            // 2. Deselect All: Remove all assigned labor
            if (!phase.lineItems) return;
            if (!confirm("Remove ALL collaborators from this phase?")) return;

            phase.lineItems = phase.lineItems.filter(i => !i.assignee); // Keep unassigned & expenses
            await Store.saveProject(project);
            location.reload();
        }
    },

    finish: async () => {
        console.log("--> Wizard.finish() CALLED");
        const modal = document.getElementById('modal-line-item-wizard');
        const phaseId = modal.getAttribute('data-phase-id');
        const editId = modal.getAttribute('data-edit-id');
        const name = document.getElementById('wiz-name').value;
        const assignee = document.getElementById('wiz-assignee').value;

        console.log("Wizard.finish for Phase:", phaseId, "Edit ID:", editId);
        console.log("Inputs - Name:", name, "Assignee:", assignee);

        let item = {
            id: editId || ('li-' + Date.now()),
            name: name,
            assignee: assignee,
            itemType: 'Expense'
        };

        if (assignee && !name.startsWith('Overhead:')) item.itemType = 'Labor';

        if (Wizard.state.type === 'Percentage') {
            item.method = 'Percentage';
            item.percent = document.getElementById('wiz-percent').value;
        } else if (Wizard.state.type === 'Import') {
            const select = document.getElementById('wiz-overhead-select');
            const option = select.options[select.selectedIndex];
            const totalOverhead = BudgetEngine.safeFloat(option.getAttribute('data-total'));

            const profileName = option.text.split(' ($')[0];

            let currentUserEmail = null;
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) currentUserEmail = user.email;

            let capacity = 2000;
            if (currentUserEmail && window._usersMap && window._usersMap[currentUserEmail]) {
                const uProfile = window._usersMap[currentUserEmail].independentProfile;
                if (uProfile && uProfile.schedule) {
                    let weeks = BudgetEngine.safeFloat(uProfile.schedule.weeks) || 50;
                    let hours = BudgetEngine.safeFloat(uProfile.schedule.hours) || 40;
                    let ratio = BudgetEngine.safeFloat(uProfile.billableRatio) || 0.75;

                    capacity = weeks * hours * ratio;
                }
            }
            if (capacity <= 0) capacity = 1;
            const calculatedRate = totalOverhead / capacity;

            item.name = `Overhead: ${profileName}`;
            item.method = 'Time';
            item.rate = calculatedRate.toFixed(2);
            item.count = 1;
            item.duration = 40;
            item.unit = 'Hours';
            item.itemType = 'Expense';

        } else {
            if (Wizard.state.isTimeBased) {
                item.method = 'Time';
                item.count = document.getElementById('wiz-time-count').value;
                item.duration = document.getElementById('wiz-time-duration').value;
                item.unit = document.getElementById('wiz-time-unit').value;
                item.rate = document.getElementById('wiz-time-rate').value;
                if (assignee) {
                    item.itemType = 'Labor';
                    item.rateMode = 'phase'; // Default to Phase Rate
                    item.rateMode = 'phase'; // Default to Phase Rate
                    item.schedMode = 'curbed'; // Default to Curbed Schedule
                } else {
                    // V130: Explicitly set manual mode for unassigned items to prevent Phase default
                    item.schedMode = 'manual';
                }

                // V132: Persist Calculator Details if available
                if (Wizard.state.calcDetails) {
                    item.schedDetails = Wizard.state.calcDetails;
                }
            } else {
                if (Wizard.state.fixedType === 'Lump') {
                    item.method = 'LumpSum';
                    item.amount = document.getElementById('wiz-lump-amount').value;
                    if (assignee) {
                        item.itemType = 'Labor';
                        // V107: Default to Phase Schedule
                        item.schedMode = 'phase';
                    }
                } else {
                    item.method = 'Unit';
                    item.count = document.getElementById('wiz-unit-qty').value;
                    item.rate = document.getElementById('wiz-unit-cost').value;
                }
            }
        }

        const project = Wizard.project || window._project;
        if (project) {
            const phase = project.phases.find(p => p.id === phaseId);
            if (phase) {
                console.log("Phase Found:", phase.name);
                if (!phase.lineItems) phase.lineItems = [];
                if (editId) {
                    const idx = phase.lineItems.findIndex(i => i.id === editId);
                    if (idx >= 0) phase.lineItems[idx] = { ...phase.lineItems[idx], ...item };
                } else {
                    console.log("Pushing New Item:", item);
                    phase.lineItems.push(item);
                }

                try {
                    console.log("Saving Project...");
                    await Store.saveProject(project);
                    console.log("Save Complete. Reloading...");
                    modal.style.display = 'none';
                    // alert("System says: Save Complete! Check Console logs now.");
                    location.reload();
                } catch (err) {
                    console.error("SAVE ERROR:", err);
                    alert("Failed to save item: " + err.message);
                }
            } else {
                console.error("CRITICAL: Phase not found for ID:", phaseId);
                alert(`Error: Phase not found (ID: ${phaseId}). Please reload and try again.`);
            }
        } else {
            console.error("CRITICAL: Project object missing.");
            alert("Error: Project data not loaded.");
        }
    },

    // Unified Toggle
    // Unified Toggle
    toggleMember: async (phaseId, memberId, event) => {
        // V61: Click Handler - PREVENT DEFAULT immediately to control flow
        event.preventDefault();
        event.stopPropagation();

        const checkbox = event.target;
        // Current state (because we prevented default) is the state BEFORE the click.
        // So if it is Checked, user is trying to UNCHECK (Remove).
        const isCurrentlyChecked = checkbox.checked;

        window.logToUI(`Click intercepted. Current State: ${isCurrentlyChecked ? 'Checked (Removing)' : 'Unchecked (Adding)'}`);

        if (!isCurrentlyChecked) {
            // User wants to ADD (Turn ON)
            window.logToUI("Adding Member...");
            checkbox.checked = true; // Manually check it
            await Wizard.openForMember(phaseId, memberId);
        } else {
            // User wants to REMOVE (Turn OFF)
            // RESTORE CUSTOM MODAL (V67)
            Wizard.pendingConfirm = {
                type: 'single',
                phaseId: phaseId,
                memberId: memberId,
                target: checkbox
            };
            const msgEl = document.getElementById('confirm-message');
            const modalEl = document.getElementById('modal-confirm-action');
            if (msgEl && modalEl) {
                msgEl.innerText = `Remove ${memberId} from this phase?`;
                modalEl.style.display = 'block';
                window.logToUI("Confirm modal displayed (V67).");
            } else {
                alert("Error: Modal missing.");
            }
        }
    },

    // Master Toggle
    toggleAll: async (phaseId, event) => {
        event.preventDefault();
        event.stopPropagation();
        const checkbox = event.target;
        const isCurrentlyChecked = checkbox.checked;
        const shouldSelectAll = !isCurrentlyChecked; // Invert intent

        window.logToUI(`Toggle All Clicked. Intent: ${shouldSelectAll ? 'Select All' : 'Deselect All'}`);

        try {
            if (shouldSelectAll) {
                // Select All Logic
                // FORCE FRESH PROJECT REF
                const project = window._project;
                const phase = project.phases.find(p => p.id === phaseId);

                // ... logic proceeds ...
                if (!phase) {
                    window.logToUI("Error: Phase not found.");
                    return;
                }

                // FIXED: Use heuristic matching renderTeamPool to identify assigned labor
                // This ensures we catch legacy items that might lack itemType="Labor"
                const isLaborItem = (i) => {
                    if (i.itemType === 'Expense') return false;
                    if (i.name && i.name.startsWith('Overhead:')) return false;
                    // It is labor if it has assignee OR is Labor type OR is Time method
                    return (i.itemType === 'Labor' || i.assignee || i.method === 'Time');
                };

                const currentAssignees = (phase.lineItems || [])
                    .filter(isLaborItem)
                    .map(i => i.assignee)
                    .filter(Boolean);

                window.logToUI(`Current Assigned IDs: ${JSON.stringify(currentAssignees)}`);

                // Build complete list including Owner
                let allMembers = [...(project.teamMembers || [])];
                if (project.owner) {
                    const ownerExists = allMembers.find(m => (m.email === project.owner || m.username === project.owner));
                    if (!ownerExists) {
                        allMembers.push({ email: project.owner, role: 'Owner' });
                    }
                }

                const missing = allMembers.filter(m => !currentAssignees.includes(m.email || m.username));
                window.logToUI(`Total Members Checked: ${allMembers.length}`);
                window.logToUI(`Missing Count: ${missing.length}`);
                if (missing.length > 0) {
                    window.logToUI(`Missing IDs: ${JSON.stringify(missing.map(m => m.email || m.username))}`);
                }

                if (missing.length === 0) {
                    // If nothing to add, ensure checkbox is checked
                    checkbox.checked = true;
                    return;
                }

                missing.forEach(m => {
                    const mid = m.email || m.username;
                    const user = (window._usersMap && window._usersMap[mid]) || {};
                    const profile = user.independentProfile || {};

                    let rate = "50.00";
                    try {
                        if (window.BudgetEngine) {
                            const rates = window.BudgetEngine.getWorkerRates(profile);
                            // Check if rates is valid object before accessing goal
                            if (rates && typeof rates.goal === 'number' && rates.goal > 0) {
                                rate = rates.goal.toFixed(2);
                            }
                        }
                    } catch (err) {
                        window.logToUI(`Rate Warn for ${mid}: ${err.message}`);
                    }

                    let hours = 40;
                    if (profile.schedule) hours = parseFloat(profile.schedule.hours) || 40;

                    const item = {
                        id: 'li-' + Math.random().toString(36).substr(2, 9),
                        name: m.role || 'Collaborator',
                        assignee: mid,
                        itemType: 'Labor',
                        method: 'Time',
                        rate: rate,
                        unit: 'Hours',
                        duration: hours,
                        count: 1,
                        rateMode: 'phase',
                        schedMode: 'curbed'
                    };
                    if (!phase.lineItems) phase.lineItems = [];
                    phase.lineItems.push(item);
                });

                await Store.saveProject(project);
                if (!Wizard.DEBUG_NO_RELOAD) {
                    location.reload();
                } else {
                    window.logToUI("SUCCESS: Added missing members. RELOAD SUPPRESSED.");
                    alert("Success: Added Members. Page Reload Blocked by Debug Mode.");
                }

            } else {
                // Deselect All (Remove) - Use Custom Modal
                Wizard.pendingConfirm = {
                    type: 'all',
                    phaseId: phaseId,
                    target: checkbox
                };
                const msgEl = document.getElementById('confirm-message');
                const modalEl = document.getElementById('modal-confirm-action');
                if (msgEl && modalEl) {
                    msgEl.innerText = "Remove ALL collaborators from this phase?";
                    modalEl.style.display = 'block';
                }
            }
        } catch (e) {
            window.logToUI(`CRITICAL ToggleAll Error: ${e.message}`);
            console.error("ToggleAll Error:", e);
        }
    },

    resolveConfirm: async (confirmed) => {
        document.getElementById('modal-confirm-action').style.display = 'none';

        if (!confirmed) {
            // If checkbox toggle, revert it?
            if (Wizard.pendingConfirm && Wizard.pendingConfirm.target) {
                Wizard.pendingConfirm.target.checked = true; // Restore check
            }
            Wizard.pendingConfirm = null;
            return;
        }

        // V91: Handle Phase Delete
        if (Wizard.pendingConfirm && Wizard.pendingConfirm.type === 'deletePhase') {
            const { phaseId } = Wizard.pendingConfirm;
            console.log("Confirmed Delete Phase:", phaseId);
            const project = Wizard.project || window._project;
            project.phases = project.phases.filter(p => p.id !== phaseId);
            await Store.saveProject(project);
            location.reload();
            Wizard.pendingConfirm = null;
            return;
        }

        // Existing Logic (Toggle Member)
        // FORCE FRESH PROJECT REF
        const project = window._project;
        if (!project) return;

        const pending = Wizard.pendingConfirm; // Re-declare pending here for existing logic
        if (!pending) return; // Should not happen

        if (pending.type === 'removeMember') {
            // CASCADE DELETE MEMBER
            const mid = pending.memberId;
            // 1. Remove from Team Members
            if (project.teamMembers) {
                project.teamMembers = project.teamMembers.filter(m => (m.email !== mid && m.username !== mid));
            }
            // 2. Remove from ALL Phases
            if (project.phases) {
                project.phases.forEach(p => {
                    if (p.lineItems) {
                        p.lineItems = p.lineItems.filter(i => i.assignee !== mid);
                    }
                });
            }
            await Store.saveProject(project);
            location.reload();
            Wizard.pendingConfirm = null; // Clear pending after execution
            return;
        }

        const phase = project.phases.find(p => p.id === pending.phaseId);
        if (!phase) return;

        // HANDLE 'ALL' REMOVAL
        if (pending.type === 'all') {
            // Logic to remove all assigned labor
            const isLaborItem = (i) => {
                if (i.itemType === 'Expense') return false;
                if (i.name && i.name.startsWith('Overhead:')) return false;
                return (i.itemType === 'Labor' || i.assignee || i.method === 'Time');
            };
            const initialCount = phase.lineItems.length;
            phase.lineItems = phase.lineItems.filter(i => !isLaborItem(i)); // Remove all labor
            const removed = initialCount - phase.lineItems.length;

            if (removed > 0) {
                await Store.saveProject(project);
                if (!Wizard.DEBUG_NO_RELOAD) location.reload();
                else {
                    alert(`Success: Removed ${removed} items. Reload Blocked.`);
                    // Visual update? Hard to do for all rows.
                }
            }
            Wizard.pendingConfirm = null; // Clear pending after execution
            return;
        }

        if (pending.type === 'single') {
            // FIXED: Match heuristic to find the item to remove
            const isLaborItem = (i) => {
                if (i.itemType === 'Expense') return false;
                if (i.name && i.name.startsWith('Overhead:')) return false;
                return (i.itemType === 'Labor' || i.assignee || i.method === 'Time');
            };

            // FIXED: DELETE ALL MATCHING ITEMS (Fixes duplicate persistence)
            const initialCount = phase.lineItems.length;
            phase.lineItems = phase.lineItems.filter(i => !(i.assignee === pending.memberId && isLaborItem(i)));
            const finalCount = phase.lineItems.length;
            const removed = initialCount - finalCount;
            // RESTORE SAVE FOR FINAL FIX V61
            if (removed > 0) {
                await Store.saveProject(project);
                if (!Wizard.DEBUG_NO_RELOAD) {
                    location.reload();
                } else {
                    window.logToUI(`SUCCESS: Deleted ${removed} items in memory. RELOAD SUPPRESSED.`);
                    alert(`Success: Removed ${removed} items. Page Reload Blocked by Debug Mode.`);
                    // Visual Cleanup
                    if (pending.target) {
                        pending.target.closest('tr').style.opacity = '0.2';
                    }
                }
            } else {
                // Debug dump
                const candidates = phase.lineItems.filter(i => i.assignee === pending.memberId);
                const candidateLog = JSON.stringify(candidates.map(c => ({ id: c.id, type: c.itemType, name: c.name, method: c.method })));
                alert(`DEBUG WARNING: Remove Failed. Found 0 items to delete.\nCandidates in Phase: ${candidateLog}\nPending ID: ${pending.memberId}`);
                window.logToUI("REMOVE FAILED: 0 items found.");
                // location.reload();
            }
        } else if (pending.type === 'all') { // This is a duplicate 'all' check, keeping for now as per original
            // FIXED: Remove all matches
            const isLaborItem = (i) => {
                if (i.itemType === 'Expense') return false;
                if (i.name && i.name.startsWith('Overhead:')) return false;
                return (i.itemType === 'Labor' || i.assignee || i.method === 'Time');
            };
            phase.lineItems = phase.lineItems.filter(i => !(i.assignee && isLaborItem(i)));
            await Store.saveProject(project);
            location.reload();
        }
        Wizard.pendingConfirm = null;
    },

    // --- Member Managment ---
    openEditMember: (memberId) => {
        const project = Wizard.project || window._project;
        const member = (project.teamMembers || []).find(m => (m.email === memberId || m.username === memberId));
        if (!member) return;

        const user = window._usersMap[memberId] || {};
        const name = user.name || member.name || memberId;

        document.getElementById('edit-member-id').value = memberId;
        document.getElementById('edit-member-name').textContent = name;
        document.getElementById('edit-member-role').value = member.role || '';
        document.getElementById('modal-edit-member').style.display = 'block';
    },

    saveMemberEdit: async () => {
        const mid = document.getElementById('edit-member-id').value;
        const newRole = document.getElementById('edit-member-role').value;
        const project = Wizard.project || window._project;

        const member = (project.teamMembers || []).find(m => (m.email === mid || m.username === mid));
        if (member) {
            member.role = newRole;
            await Store.saveProject(project);
            location.reload();
        }
    },

    removeMember: () => {
        const mid = document.getElementById('edit-member-id').value;
        // Close Edit Modal
        document.getElementById('modal-edit-member').style.display = 'none';

        // Open Confirm Modal
        Wizard.pendingConfirm = {
            type: 'removeMember',
            memberId: mid
        };
        document.getElementById('confirm-message').innerText = `Permanently remove ${mid} and all their assignments from this project?`;
        document.getElementById('modal-confirm-action').style.display = 'block';
    },
};
window.Wizard = Wizard;


// V82: New Phase Logic
window.saveNewPhase = async () => {
    const name = document.getElementById('new-phase-name').value;
    if (!name || name.trim() === '') return alert("Please enter a phase name");

    const newPhase = {
        id: crypto.randomUUID(),
        name: name.trim(),
        weeks: 50,
        hours: 40,
        rateMode: 'project',
        lineItems: []
    };

    if (!window._project.phases) window._project.phases = [];
    window._project.phases.push(newPhase);

    await Store.saveProject(window._project);
    document.getElementById('modal-add-phase').style.display = 'none';
    location.reload();
};

// --- App Logic ---
async function initApp(retryCount = 0) {
    const logDebug = (msg) => { if (window.debugLog) window.debugLog(msg); else console.log("[DEBUG]", msg); };

    // Retry Logic for Store
    if (typeof Store === 'undefined') {
        if (retryCount < 5) {
            logDebug(`Store undefined, retrying (${retryCount + 1}/5)...`);
            setTimeout(() => initApp(retryCount + 1), 500);
            return;
        }
        logDebug("CRITICAL: Store undefined after retries.");
        return;
    }

    try {
        // Force init to ensure Supabase client is ready
        if (!window.supabaseClient) await Store.init();
        await Store.checkSession();
    } catch (e) {
        console.warn("Session check warning:", e);
    }

    // V82: Attach New Phase Listeners
    const btnAddPhase = document.getElementById('btn-add-phase');
    if (btnAddPhase) {
        btnAddPhase.onclick = () => {
            document.getElementById('new-phase-name').value = '';
            document.getElementById('modal-add-phase').style.display = 'block';
        };
    }
    const btnSaveNewPhase = document.getElementById('btn-save-new-phase');
    if (btnSaveNewPhase) {
        btnSaveNewPhase.onclick = window.saveNewPhase;
    }

    // UI Logger
    window.logToUI = (msg) => {
        const consoleEl = document.getElementById('debug-console');
        if (consoleEl) {
            consoleEl.style.display = 'block';
            const line = document.createElement('div');
            line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            consoleEl.appendChild(line);
            consoleEl.scrollTop = consoleEl.scrollHeight;
        }
        console.log("[UI LOG]", msg);
    };

    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('id');
    if (!projectId) {
        logDebug("ERROR: No ID found in URL");
        const listContainer = document.getElementById('collaborators-list');
        if (listContainer) listContainer.innerHTML = '<p style="padding:10px; color:red;">No Project ID found. Please return to <a href="projects.html">My Projects</a> and select a project.</p>';
        return;
    }

    let project = null;
    try {
        project = await Store.getProject(projectId);
    } catch (e) {
        console.error("Fetch Error:", e);
        document.getElementById('phases-container').innerHTML = `<p style="color:red; padding:20px;">Error loading project: ${e.message}</p>`;
        const listContainer = document.getElementById('collaborators-list');
        if (listContainer) listContainer.innerHTML = '<p style="padding:10px; color:red;">Error loading project data.</p>';
        return;
    }

    if (!project) return;
    window._project = project; // Success!

    // DEBUG V101: Analyze Loaded Data
    console.log("DEBUG V101: Project Loaded.", project.id);
    (project.phases || []).forEach(p => {
        console.log(`Phase [${p.name}]: ${p.lineItems ? p.lineItems.length : 0} items.`);
        if (p.lineItems) {
            p.lineItems.forEach(i => console.log(` - Item: ${i.name} (${i.itemType}) Assignee: ${i.assignee}`));
        }
    });

    const title = document.getElementById('project-title');
    if (title) title.textContent = project.name;

    try {
        const members = project.teamMembers || [];
        const memberEmails = members.map(m => m.email || m.username);
        if (project.owner) memberEmails.push(project.owner);

        let usersMap = {};
        if (Store.getUsersMap) usersMap = await Store.getUsersMap(memberEmails);
        window._usersMap = usersMap; // FIX: Assign to global for modals to access

        let invites = [];
        if (Store.getProjectInvites) invites = await Store.getProjectInvites(projectId);

        setupGlobalRates(); // Initialize inputs before rendering
        renderDashboard(project, usersMap, invites);
        assignGlobalHelpers();
        setupInviteHandlers(projectId);

        // V97: Removed programmatic onclick assignment for btn-wizard-finish
        // It is now handled inline in HTML to ensure it works even if initApp fails partially.
        // const btnFinish = document.getElementById('btn-wizard-finish');
        // if (btnFinish) btnFinish.onclick = Wizard.finish;

    } catch (e) {
        console.error("CRITICAL RENDER ERROR:", e);
        const container = document.getElementById('phases-container');
        if (container) {
            container.innerHTML = `<div style="padding:20px; color:white; background:red; border-radius:5px;">
                <h3>Application Error</h3>
                <p>${e.message}</p>
                <small>Check console for stack trace.</small>
                <br><br>
                <button class="btn" onclick="location.reload()" style="background:white; color:red;">Reload</button>
            </div>`;
        }
        alert("Critical Error: " + e.message);
    }
}


function assignGlobalHelpers() {
    window.openInviteModal = () => { document.getElementById('modal-invite-member').style.display = 'block'; };

    // V117: Income Modal Logic
    const btnIncome = document.getElementById('btn-open-income-modal');
    if (btnIncome) btnIncome.onclick = () => window.openIncomeModal();

    window.openIncomeModal = () => {
        window._editingSourceId = null; // Clear edit state

        // V121: Hide Delete Button on Create
        const btnDel = document.getElementById('btn-delete-income');
        if (btnDel) btnDel.style.display = 'none';

        document.getElementById('income-source-name').value = '';
        document.getElementById('income-source-amount').value = '';
        document.getElementById('income-source-status').value = 'Confirmed';
        document.getElementById('modal-manage-income').style.display = 'block';
    };

    window.editFundingSource = (id) => {
        const project = window._project;
        if (!project || !project.incomeSources) return;
        const src = project.incomeSources.find(s => s.id === id);
        if (!src) return;

        window._editingSourceId = id; // Set edit state

        // V121: Show Delete Button on Edit
        const btnDel = document.getElementById('btn-delete-income');
        if (btnDel) btnDel.style.display = 'block';

        document.getElementById('income-source-name').value = src.name;
        document.getElementById('income-source-amount').value = src.amount;
        document.getElementById('income-source-status').value = src.status || 'Confirmed';
        document.getElementById('modal-manage-income').style.display = 'block';
    };

    // V121: Delete Logic
    window.deleteFundingSource = async () => {
        if (!window._editingSourceId) return;
        if (!confirm("Are you sure you want to delete this funding source?")) return;

        const project = window._project;
        if (project.incomeSources) {
            project.incomeSources = project.incomeSources.filter(s => s.id !== window._editingSourceId);
            await Store.saveProject(project);
        }

        document.getElementById('modal-manage-income').style.display = 'none';
        window._editingSourceId = null;
        renderDashboard(project, window._usersMap, []);
    };

    window.saveFundingSource = async () => {
        const name = document.getElementById('income-source-name').value;
        const amount = parseFloat(document.getElementById('income-source-amount').value) || 0;
        const status = document.getElementById('income-source-status').value;

        if (!name || amount <= 0) {
            alert("Please enter a valid name and amount.");
            return;
        }

        const project = window._project;
        if (!project.incomeSources) project.incomeSources = [];

        if (window._editingSourceId) {
            // Update Existing
            const idx = project.incomeSources.findIndex(s => s.id === window._editingSourceId);
            if (idx >= 0) {
                project.incomeSources[idx].name = name;
                project.incomeSources[idx].amount = amount;
                project.incomeSources[idx].status = status;
            }
        } else {
            // Create New
            project.incomeSources.push({
                id: 'src_' + Date.now(),
                name: name,
                amount: amount,
                status: status
            });
        }

        await Store.saveProject(project);
        document.getElementById('modal-manage-income').style.display = 'none';
        window._editingSourceId = null;

        // Re-render
        renderDashboard(project, window._usersMap, []);
    };
}

function setupInviteHandlers(currentProjectId) {
    const btnSend = document.getElementById('btn-send-invite');
    if (btnSend) {
        btnSend.addEventListener('click', () => {
            const emailInput = document.getElementById('invite-email');
            if (emailInput && emailInput.value) {
                btnSend.textContent = "Sending...";
                Store.inviteUser(window._project.id, emailInput.value)
                    .then(() => {
                        alert('Invite sent successfully!');
                        document.getElementById('modal-invite-member').style.display = 'none';
                        emailInput.value = '';
                        initApp();
                    })
                    .catch(err => {
                        console.error(err);
                        alert('Error sending invite: ' + err.message);
                    })
                    .finally(() => { btnSend.textContent = "Send Invite"; });
            } else {
                alert('Please enter an email address.');
            }
        });
    }
    const btnAddPool = document.getElementById('btn-add-member');
    if (btnAddPool) {
        btnAddPool.addEventListener('click', () => { window.openInviteModal(); });
    }
}

function renderDashboard(project, usersMap, invites = []) {
    // Pass data to Wizard directly to ensure availability
    if (window.Wizard) {
        window.Wizard.project = project;
        window.Wizard.usersMap = usersMap;
    }

    try { renderCollaborators(project, usersMap, invites); } catch (e) { console.error("Error rendering Collaborators:", e); }
    try { renderPhases(project, usersMap); } catch (e) {
        // Error handling moved inside renderPhases for on-screen reporting
        console.error("Error calling renderPhases:", e);
    }
    try { renderTeamPool(project, usersMap); } catch (e) { console.error("Error rendering Team Pool:", e); }
    try { calculateAndRenderTotals(project, usersMap); } catch (e) { console.error("Error rendering Totals:", e); }

    // On-Screen Data Debug
    const title = document.querySelector('.app-header h1');
    if (title) {
        // V138: Removed Debug String from Header
    }
}

function renderCollaborators(project, usersMap, invites = []) {
    const list = document.getElementById('collaborators-list');
    if (!list) return;
    list.innerHTML = '';

    const ownerDiv = document.createElement('div');
    ownerDiv.className = 'summary-card';
    ownerDiv.style.padding = '10px';

    // Fetch Owner Details
    let ownerStats = '';
    if (project.owner) {
        if (window.BudgetEngine) {
            const ownerUser = usersMap[project.owner] || {};
            const ownerProfile = ownerUser.independentProfile || {};
            const ownerRates = window.BudgetEngine.getWorkerRates(ownerProfile);
            ownerStats = ownerRates.goal > 0 ? `<br>Goal: $${ownerRates.goal.toFixed(2)}/hr` : `<br><span style="color:red">Incomplete</span>`;
        }
    }

    ownerDiv.innerHTML = `<strong>Owner</strong><br>${project.owner || 'Unknown'}${ownerStats}`;
    list.appendChild(ownerDiv);

    // V137: Aggressive Deduplication for Collaborators UI
    const seenIds = new Set();
    const normalize = (s) => (s || '').trim().toLowerCase();

    // 1. Render Members (deduplicated)
    (project.teamMembers || []).forEach(m => {
        // Skip Owner
        if (project.owner && (normalize(m.email) === normalize(project.owner) || normalize(m.username) === normalize(project.owner))) return;

        // Dedup Check
        const id = normalize(m.email || m.username);
        const canonId = usersMap[id] ? normalize(usersMap[id].email || usersMap[id].username) : id;

        if (seenIds.has(canonId)) return;
        seenIds.add(canonId);

        const d = document.createElement('div');
        d.className = 'summary-card';
        d.style.padding = '10px';

        // Lookup User
        // Try all keys
        let user = usersMap[m.username] || usersMap[m.email] || usersMap[canonId] || {};
        const profile = user.independentProfile || {};

        let stats = '';
        if (window.BudgetEngine) {
            const rates = window.BudgetEngine.getWorkerRates(profile);
            stats = rates.goal > 0 ? `Goal: $${rates.goal.toFixed(2)}/hr` : `<span style="color:red">Incomplete</span>`;
        } else {
            stats = '<span style="color:orange">Calc Unavailable</span>';
        }

        d.innerHTML = `<strong>${m.name || m.username}</strong><br>${m.email || m.username}<br>${stats}`;
        list.appendChild(d);

        // Also add email to seen if available, to block pending invites
        if (m.email) seenIds.add(normalize(m.email));
        if (user.email) seenIds.add(normalize(user.email));
    });

    // 2. Render Invites (Filtered)
    invites.forEach(inv => {
        // Skip if already in members (Seen IDs)
        if (seenIds.has(normalize(inv.email))) return;

        const d = document.createElement('div');
        d.className = 'summary-card';
        d.style.padding = '10px';
        d.style.border = '1px dashed #ccc';
        d.style.opacity = '0.7';
        d.innerHTML = `<strong>${inv.email}</strong><br><span style="color:#666;">(Pending)</span>`;
        list.appendChild(d);
    });
}

function renderPhases(project, usersMap = {}) {
    const container = document.getElementById('phases-container');
    if (!container) return;
    container.innerHTML = '';

    if (!project.phases || project.phases.length === 0) {
        container.innerHTML = '<p style="padding:20px; color:#999;">No phases yet. Click "Add Phase" above.</p>';
        return;
    }

    try {
        window.openAddLineItem = (pid) => { Wizard.open(pid); };
        /* 
           getProjectCapsRender defined inside loop to access local state if needed,
           but better to defined global or outside.
           Wait, previous version had it outside loop? No, inside.
           Moving helper to TOP of renderPhases (outside loop) for efficiency and hoisting safety.
        */
        const getProjectCapsRender = () => {
            const p = window._project;
            const min = parseFloat(p.globalRates ? p.globalRates.minWage : 0) || 0;
            const max = parseFloat(p.globalRates ? p.globalRates.maxWage : 9999) || 9999;
            return { min, max };
        };

        // Helper to Get Caps (Scoped here or global)
        // (Old getProjectCapsRender was here, removed)

        project.phases.forEach(phase => {
            const pDiv = document.createElement('div');
            pDiv.className = 'phase-block';
            pDiv.style.border = '1px solid #ddd';
            pDiv.style.borderRadius = '5px';
            pDiv.style.background = '#fff';
            pDiv.style.marginBottom = '20px';
            pDiv.style.overflow = 'hidden';

            // 1. HEADER
            const isActive = phase.active !== false; // Default True
            pDiv.style.opacity = isActive ? '1' : '0.6';
            if (!isActive) pDiv.style.filter = 'grayscale(100%)';

            pDiv.innerHTML = `<div style="background:#000; color:#fff; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:15px;">
                     <label class="switch">
                          <input type="checkbox" ${isActive ? 'checked' : ''} onchange="window.togglePhaseActive('${phase.id}', this.checked)">
                          <span class="slider"></span>
                      </label>
                     <h3 style="margin:0; font-size:1.2rem;">${phase.name} ${!isActive ? '(Inactive)' : ''}</h3>
                </div>
                <div style="display:flex; gap:15px; align-items:center;">
                    <button class="btn btn-sm" style="background:#fff; color:#000; padding:5px 10px; border:none;" onclick="window.openAddLineItem('${phase.id}')">+ Add Item</button>
                    <button class="btn btn-sm" style="background:transparent; color:#3498db; padding:5px 10px; border:1px solid #3498db;" onclick="window.duplicatePhase('${phase.id}')" title="Duplicate Phase"><i class="fa fa-copy"></i> Duplicate</button>
                    <button class="btn btn-sm" style="background:transparent; color:#ffaabb; padding:5px 10px; border:1px solid #ffaabb;" onclick="window.deletePhase('${phase.id}')" title="Delete Phase"><i class="fa fa-trash"></i></button>
                </div>
            </div>
            
            <!-- 2. PHASE DETAILS INPUTS -->
            <div style="padding:10px 15px; background:#f5f5f5; border-bottom:1px solid #ddd; display:flex; gap:20px; font-size:0.9rem; align-items:center;">
                <div>
                    <label style="font-weight:bold; margin-right:5px;">Est. Weeks:</label>
                    <input type="number" value="${phase.weeks || ''}" style="width:50px; padding:3px;" onchange="window.updatePhaseDetail('${phase.id}', 'weeks', this.value)" placeholder="50">
                </div>
                <div>
                    <label style="font-weight:bold; margin-right:5px;">Hrs/Wk:</label>
                    <input type="number" value="${phase.hours || ''}" style="width:50px; padding:3px;" onchange="window.updatePhaseDetail('${phase.id}', 'hours', this.value)" placeholder="40">
                </div>
                <div style="border-left:1px solid #ccc; padding-left:15px; margin-left:5px;">
                     <label style="font-weight:bold; margin-right:5px;">Rates:</label>
                     ${(() => {
                    let ratesUI = `<div style="display:flex; gap:10px; align-items:center;">
                        <select onchange="window.updatePhaseDetail('${phase.id}', 'rateMode', this.value)" style="padding:3px;">
                            <option value="project" ${(!phase.rateMode || phase.rateMode === 'project') ? 'selected' : ''}>Use Project Rates</option>
                            <option value="override" ${phase.rateMode === 'override' ? 'selected' : ''}>Override Rates</option>
                        </select>`;

                    if (phase.rateMode === 'override') {
                        const payVal = phase.payRate || 100;
                        const expVal = phase.expenseRate || 100;
                        ratesUI += `<div style="display:flex; flex-direction:column;">
                                     <span style="font-size:0.7rem; color:#666;">Pay Rate %</span>
                                     <input type="number" placeholder="100" value="${payVal}" style="width:60px; padding:3px;" 
                                         onchange="window.updatePhaseDetail('${phase.id}', 'payRate', this.value)">
                                 </div>
                                 <div style="display:flex; flex-direction:column;">
                                     <span style="font-size:0.7rem; color:#666;">Exp Rate %</span>
                                     <input type="number" placeholder="100" value="${expVal}" style="width:60px; padding:3px;" 
                                         onchange="window.updatePhaseDetail('${phase.id}', 'expenseRate', this.value)">
                                 </div>`;
                    }
                    ratesUI += `</div>`;
                    return ratesUI;
                })()}
                </div>
            </div>`;

            // 3. WAGES HEADER
            pDiv.innerHTML += `<div style="padding:15px; border-bottom:1px solid #eee;">
                <h4 style="font-size:0.9rem; text-transform:uppercase; color:#666; margin:0;">Worker Wages</h4>
            </div>`;

            // V86: ALWAYS render table structure, even if no line items yet.
            // This ensures Ghost Rows (Owner/Members) appear so they can be added.
            const assignedLabor = [];
            const unassignedLabor = [];
            const expenseItems = [];
            let phaseFixedSubtotal = 0;
            let phaseTotalPct = 0; // V125: Track total percentage for gross up

            // Safety Check for null lineItems
            const calculateItemCost = (item) => {
                let cost = 0;
                if (item.method === 'LumpSum') {
                    cost = parseFloat(item.amount) || 0;
                } else if (item.method === 'Unit') {
                    cost = (parseFloat(item.rate) || 0) * (parseFloat(item.count) || 0);
                } else if (item.method === 'Time') {
                    // 1. Rate
                    let effectiveRate = parseFloat(item.rate) || 0;
                    if (item.rateMode === 'phase') {
                        let payMod = 100;
                        if (phase.rateMode === 'override') payMod = parseFloat(phase.payRate) || 100;
                        const baseRate = parseFloat(item.rate) || 0;
                        let calcRate = baseRate * (payMod / 100);

                        const caps = getProjectCapsRender();
                        if (calcRate < caps.min) calcRate = caps.min;
                        if (calcRate > caps.max) calcRate = caps.max;
                        if (calcRate > baseRate) calcRate = baseRate; // Goal Cap
                        effectiveRate = calcRate;
                    }

                    // 2. Schedule
                    let effWeeks = parseFloat(item.count) || 0; // standard
                    let effHours = parseFloat(item.duration) || 0; // standard

                    if (item.schedMode === 'phase') {
                        effWeeks = parseFloat(phase.weeks) || 50;
                        effHours = parseFloat(phase.hours) || 40;
                    } else if (item.schedMode === 'curbed') {
                        const pWeeks = parseFloat(phase.weeks) || 50;
                        const pHours = parseFloat(phase.hours) || 40;
                        if (effWeeks > pWeeks) effWeeks = pWeeks;
                        if (effHours > pHours) effHours = pHours;
                    }

                    cost = effectiveRate * effWeeks * effHours;

                    // 3. Overhead Add-on?
                    let ohRate = parseFloat(item.overheadRate) || 0;
                    if (ohRate === 0 && (!item.overheadSelections || item.overheadSelections.length === 0)) {
                        if (item.assignee && usersMap[item.assignee]) {
                            const up = usersMap[item.assignee].independentProfile;
                            if (up) {
                                const r = window.BudgetEngine.getWorkerRates(up);
                                if (r.overhead > 0) ohRate = r.overhead;
                            }
                        }
                    }
                    const ohCost = ohRate * effWeeks * effHours;
                    cost += ohCost;
                } else if (item.method === 'Percentage') {
                    // V129: Add missing Percentage Logic to Helper
                    const pct = parseFloat(item.percent) || 0;
                    let grossUpFactor = 1;
                    if (phaseTotalPct < 100) {
                        grossUpFactor = 1 / (1 - (phaseTotalPct / 100));
                    }
                    const totalPhaseCost = phaseFixedSubtotal * grossUpFactor;
                    cost = totalPhaseCost * (pct / 100);
                }
                return cost;
            };

            // Safety Check for null lineItems
            if (phase.lineItems) {
                console.log(`RenderPhases [${phase.name}] - Processing ${phase.lineItems.length} raw items.`);
                phase.lineItems.forEach(i => {

                    // Check if Labor
                    let isLabor = false;
                    const isOverhead = i.name && i.name.startsWith('Overhead:');
                    if (i.itemType === 'Labor') isLabor = true;
                    else if (i.assignee && !isOverhead) isLabor = true; // Implicit assignment
                    else if (i.method === 'Time' && !isOverhead) isLabor = true; // Fallback heuristic

                    // Override: If explicitly Expense type
                    if (i.itemType === 'Expense') isLabor = false;

                    // Calculate Cost for Subtotal (Fixed only)
                    // V126: Use helper to ensure Overhead is included
                    let cost = 0;
                    if (i.method !== 'Percentage') {
                        cost = calculateItemCost(i);
                        phaseFixedSubtotal += cost;
                    } else {
                        // V125: Accumulate Percentage for Gross Up
                        phaseTotalPct += (parseFloat(i.percent) || 0);
                    }

                    if (isLabor) {
                        if (i.assignee) assignedLabor.push({ ...i });
                        else unassignedLabor.push({ ...i });
                    } else {
                        expenseItems.push({ ...i });
                    }
                });
            } // Close safety check block from V86

            // (getProjectCapsRender moved up)

            // CALCULATE TOTALS
            // (calculateItemCost moved up)

            // CALCULATE TOTALS
            let totalLaborCost = 0;
            let totalExpenseCost = 0;

            assignedLabor.forEach(i => totalLaborCost += calculateItemCost(i));
            unassignedLabor.forEach(i => totalLaborCost += calculateItemCost(i));
            expenseItems.forEach(i => totalExpenseCost += calculateItemCost(i));

            const phaseTotalCost = totalLaborCost + totalExpenseCost;


            // RENDER PREP: Define Row Renderer Helper
            // Uses 'phase' from closure
            const renderRow = (item, isAssigned = true, user = null) => {
                let cost = 0;
                let descRate = '-';
                let descSched = '-';
                let descOverhead = '-';
                // V72: Lift scope
                let effectiveWeeks = 0;
                let effectiveHours = 0;
                // V105: Lift scope for Equity Calc
                let effectiveRate = 0;

                // V107: Refactored Schedule Logic (Shared for Time & LumpSum)
                if (item.method === 'Time' || (item.method === 'LumpSum' && item.itemType === 'Labor')) {
                    // 1. Determine Schedule Values
                    let effWeeks = parseFloat(item.count) || 0;
                    let effHours = parseFloat(item.duration) || 0;

                    if (item.schedMode === 'phase' || !item.schedMode) { // Default to phase if undefined
                        effWeeks = parseFloat(phase.weeks) || 50;
                        effHours = parseFloat(phase.hours) || 40;
                    } else if (item.schedMode === 'curbed') {
                        const pWeeks = parseFloat(phase.weeks) || 50;
                        const pHours = parseFloat(phase.hours) || 40;
                        if (effWeeks > pWeeks) effWeeks = pWeeks;
                        if (effHours > pHours) effHours = pHours;
                    }

                    effectiveWeeks = effWeeks;
                    effectiveHours = effHours;
                    effectiveWeeks = effWeeks;
                    effectiveHours = effHours;

                    // V130: Dynamic Label based on Unit
                    // V132: Detailed Schedule Override
                    if (item.schedDetails) {
                        const { hpd, dpw, wks } = item.schedDetails;
                        const labelCount = effWeeks > 1 ? `${effWeeks} people` : '1 person'; // 'effWeeks' is actually 'count' here due to logic mapping
                        descSched = `${labelCount} x ${wks} wks @ ${dpw} d/wk (${hpd} hrs/d)`;
                    } else if (item.unit === 'Days') {
                        descSched = `${effWeeks} items x ${effHours} days`;
                    } else if (item.unit === 'Hours') {
                        descSched = `${effWeeks} items x ${effHours} hrs`;
                    } else if (item.unit === 'Weeks') {
                        descSched = `${effWeeks} people x ${effHours} wks`;
                    } else {
                        // Default Fallback
                        descSched = `${effectiveWeeks} wks x ${effectiveHours} hrs`;
                    }
                }

                // Calc Cost & Rate Description
                if (item.method === 'LumpSum') {
                    cost = parseFloat(item.amount) || 0;
                    descRate = `$${cost.toLocaleString()} (Flat)`;
                    // Schedule already calc'd above if Labor
                } else if (item.method === 'Time') {
                    // Rate Logic
                    effectiveRate = parseFloat(item.rate) || 0;
                    if (item.rateMode === 'phase') {
                        let payMod = 100;
                        if (phase.rateMode === 'override') payMod = parseFloat(phase.payRate) || 100;
                        const baseRate = parseFloat(item.rate) || 0;
                        let calcRate = baseRate * (payMod / 100);
                        const caps = getProjectCapsRender();
                        if (calcRate < caps.min) calcRate = caps.min;
                        if (calcRate > caps.max) calcRate = caps.max;
                        if (calcRate > baseRate) calcRate = baseRate; // Goal Cap
                        effectiveRate = calcRate;
                    }

                    // Desc Rate
                    descRate = `$${effectiveRate.toFixed(2)} /hr`;
                    if (item.rateMode === 'phase') {
                        let payMod = parseFloat(phase.payRate) || 100;
                        if (phase.rateMode === 'override') descRate += ` (Phase ${parseFloat(phase.payRate)}%)`;
                    }
                    else if (item.rateMode === 'goal') descRate += ' (Goal)';

                    // V109: Handle Flat Rate Mode for Time Items
                    if (item.rateMode === 'flat') {
                        cost = parseFloat(item.flatFee) || 0;
                        descRate = `$${cost.toLocaleString()} (Flat)`;

                        // Recalc effectiveRate for Equity logic below
                        const totalHours = effectiveWeeks * effectiveHours;
                        if (totalHours > 0) effectiveRate = cost / totalHours;
                        else effectiveRate = 0;
                    } else {
                        // Standard Hourly Cost Logic
                        cost = effectiveRate * effectiveWeeks * effectiveHours;
                    }

                    // Overhead Logic
                    let ohRate = parseFloat(item.overheadRate) || 0;
                    if (ohRate === 0 && (!item.overheadSelections || item.overheadSelections.length === 0)) {
                        if (item.assignee && usersMap[item.assignee]) {
                            const up = usersMap[item.assignee].independentProfile;
                            if (up) {
                                const r = window.BudgetEngine.getWorkerRates(up);
                                if (r.overhead > 0) ohRate = r.overhead;
                            }
                        }
                    }
                    const ohCost = ohRate * effectiveWeeks * effectiveHours;
                    cost += ohCost;
                    if (ohCost > 0) descOverhead = `$${ohCost.toFixed(2)}`;

                } else if (item.method === 'Unit') {
                    cost = (parseFloat(item.rate) || 0) * (parseFloat(item.count) || 0);
                    descRate = `$${parseFloat(item.rate).toFixed(2)} / unit`;
                    descSched = `${item.count} units`;
                } else if (item.method === 'Percentage') {
                    const pct = parseFloat(item.percent) || 0;

                    // V125: Gross Up Calculation
                    // If multiple percentage items exist, they share the gross-up based on total %
                    let grossUpFactor = 1;
                    if (phaseTotalPct < 100) {
                        grossUpFactor = 1 / (1 - (phaseTotalPct / 100));
                    }

                    const totalPhaseCost = phaseFixedSubtotal * grossUpFactor;
                    cost = totalPhaseCost * (pct / 100);

                    descRate = `${pct}%`;
                    descSched = `of $${totalPhaseCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
                }


                let displayEquity = '-';

                // Logic for Time-Based Items
                if (item.method === 'Time' && item.itemType !== 'Expense') {
                    // Try to get Profile Goal Rate first (Source of Truth)
                    let baseRate = parseFloat(item.rate) || 0;
                    if (user && user.independentProfile) {
                        const r = window.BudgetEngine.getWorkerRates(user.independentProfile);
                        if (r.goal > 0) baseRate = r.goal;
                    }

                    const gap = Math.max(0, baseRate - effectiveRate);
                    const eqVal = gap * effectiveWeeks * effectiveHours;

                    if (eqVal > 0) {
                        displayEquity = `$${eqVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    } else if (gap <= 0 && baseRate > 0) {
                        displayEquity = `<span style="color:#ccc;">$0.00</span>`;
                    }
                }
                // V106: Logic for LumpSum Items (Flat Fee)
                else if (item.method === 'LumpSum' && item.itemType !== 'Expense') {
                    // Check if workload is defined
                    const lWeeks = parseFloat(item.count) || 0;
                    const lHours = parseFloat(item.duration) || 0;

                    if (lWeeks > 0 && lHours > 0) {
                        const totalHours = lWeeks * lHours;
                        const effectiveHourly = cost / totalHours; // Cost is Total Amount here

                        // Find Goal Rate from Profile
                        let goalRate = 0;
                        if (user && user.independentProfile) {
                            const r = window.BudgetEngine.getWorkerRates(user.independentProfile);
                            goalRate = r.goal;
                        }

                        if (goalRate > 0) {
                            const gap = Math.max(0, goalRate - effectiveHourly);
                            const eqVal = gap * totalHours;

                            if (eqVal > 0) {
                                displayEquity = `$${eqVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                // Optional: Tooltip showing math?
                            } else {
                                displayEquity = `<span style="color:#ccc;">$0.00</span>`;
                            }
                        }
                    }
                }

                if (isAssigned) {
                    const memberName = user ? (user.name || user.username) : (item.name || 'Member');

                    // TOGGLE SWITCH (CHECKED)
                    return `<tr>
                                    <td>
                                        <label class="switch">
                                        <label class="switch">
                                          <input type="checkbox" checked 
                                            class="action-toggle-member"
                                            data-phase-id="${phase.id}"
                                            data-member-id="${item.assignee}">
                                          <span class="slider"></span>
                                        </label>
                                        <strong style="margin-left:10px;">${memberName}</strong>
                                        <div style="font-size:0.75rem; color:#666; margin-left:50px;">${item.name}</div>
                                    </td>
                                    <td class="clickable-cell" onclick="window.openRateModal('${phase.id}', '${item.id}')" title="Adjust Pay Rate">
                                        ${descRate} <i class="fa fa-pencil" style="font-size:0.8rem; opacity:0.3;"></i>
                                    </td>
                                    <td class="clickable-cell" onclick="window.openScheduleModal('${phase.id}', '${item.id}')" title="Adjust Schedule">
                                        ${descSched} <i class="fa fa-pencil" style="font-size:0.8rem; opacity:0.3;"></i>
                                    </td>
                                    <td class="clickable-cell" onclick="window.openOverheadModal('${phase.id}', '${item.id}', '${user ? (user.email || user.username) : ''}')" title="Select Overhead Businesses">
                                        ${descOverhead} <i class="fa fa-pencil" style="font-size:0.8rem; opacity:0.3;"></i>
                                    </td>
                                    <td style="text-align:right; font-weight:bold;">$${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td style="text-align:right; color:#27ae60; font-weight:bold;">${displayEquity}</td>
                                </tr>`;
                } else {
                    // Unassigned (Labor) or Expense
                    const displayName = item.name || '(Unassigned)';
                    return `<tr>
                                    <td>${displayName}</td>
                                    <td>${descRate}</td>
                                    <td>${descSched}</td>
                                    <td>-</td>
                                    <td style="text-align:right; font-weight:bold;">$${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td style="text-align:right; color:#999;">${displayEquity}</td>
                                    <td style="text-align:right;">
                                        <button class="btn-text-action" onclick="Wizard.edit('${item.id}')">Edit</button>
                                        <button class="btn-text-action" style="color:red; margin-left:5px;" onclick="Wizard.deleteLineItem('${phase.id}', '${item.id}')">Del</button>
                                    </td>
                                </tr>`;
                }
            };

            // GENERATE ROWS
            let teamRows = '';
            let allSelected = false;

            // V83: Ensure Owner is included in the list of members to render
            const renderMembers = [...(window._project.teamMembers || [])];
            const ownerEmail = window._project.owner;

            // If owner exists and not already in list, add them
            if (ownerEmail && !renderMembers.find(m => (m.email === ownerEmail || m.username === ownerEmail))) {
                renderMembers.push({ email: ownerEmail, role: 'Owner' });
            }

            if (renderMembers.length > 0) {
                const totalMembers = renderMembers.length;
                let assignedCount = 0;

                teamRows = renderMembers.map(member => {
                    const mid = member.email || member.username;
                    // V102: Filter for ALL items assigned to this member
                    const memberItems = assignedLabor.filter(i => i.assignee === mid);
                    const user = usersMap[mid] || {};
                    const displayName = (user.name || user.username) || (member.email || member.role || 'Member');

                    if (memberItems.length > 0) {
                        assignedCount++; // Count member as "active" in phase
                        // Render a row for EACH item
                        return memberItems.map((item, idx) => {
                            // If we want the toggle on every row or just the first?
                            // For now, let's put toggle on every row to allow granular control (delete single item by toggling off?)
                            // Wait, toggle off triggers "deleteLineItem"? 
                            // RenderRow logic (line 1300) implements the toggle.
                            return renderRow(item, true, { ...member, ...user });
                        }).join('');
                    } else {
                        // Inactive Row (Ghost Row) - No items for this member
                        const defWeeks = phase.weeks || 50;
                        const defHours = phase.hours || 40;
                        return `<tr style="opacity:0.5; background:#f0f0f0;">
                                <td>
                                    <label class="switch">
                                          <input type="checkbox" 
                                            class="action-toggle-member" 
                                            data-phase-id="${phase.id}" 
                                            data-member-id="${mid}">
                                          <span class="slider"></span>
                                    </label>
                                    <strong style="margin-left:10px;">${displayName}</strong>
                                    <span style="font-size:0.7rem; color:#666; margin-left:5px;">(Not Assigned)</span>
                                </td>
                                        <td>-</td>
                                        <td>${defWeeks} wks x ${defHours} hrs (Est)</td>
                                        <td>-</td>
                                        <td>-</td>
                                    </tr>`;
                    }
                }).join('');

                if (totalMembers > 0 && assignedCount === totalMembers) allSelected = true;
            } else {
                teamRows = '<tr><td colspan="6" style="padding:10px;">No team members found.</td></tr>';
            }

            let unassignedRows = '';
            if (unassignedLabor.length > 0) {
                unassignedRows = unassignedLabor.map(item => renderRow(item, false)).join('');
            }

            pDiv.innerHTML += `<table class="ledger-table">
                    <thead>
                        <tr>
                            <th style="width:30%;">
                                  <label class="switch" style="transform:scale(0.8); margin-right:5px; vertical-align:middle;">
                                  <label class="switch" style="transform:scale(0.8); margin-right:5px; vertical-align:middle;">
                                      <input type="checkbox" 
                                        class="action-toggle-all" 
                                        data-phase-id="${phase.id}" 
                                        ${allSelected ? 'checked' : ''}>
                                      <span class="slider"></span>
                                </label>
                                Collaborator
                            </th>
                            <th style="width:15%;">Rate</th>
                            <th style="width:25%;">Schedule</th>
                            <th style="width:10%;">Overhead</th>
                            <th style="text-align:right;">Cost</th>
                            <th style="text-align:right;">Equity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${teamRows}
                        ${unassignedRows.length > 0 ? `<tr style="background:#eee;"><td colspan="6" style="font-weight:bold; font-size:0.8rem;">Unassigned Labor</td></tr>${unassignedRows}` : ''}
                    </tbody>
                </table>`;

            // 4. EXPENSES HEADER & TABLE
            pDiv.innerHTML += `<div style="padding:15px 15px 5px 15px; border-bottom:1px solid #eee; margin-top:0;">
                    <h4 style="font-size:0.9rem; text-transform:uppercase; color:#666; margin-bottom:10px;">Project Expenses</h4>
                </div>`;

            if (expenseItems.length > 0) {
                const expRows = expenseItems.map(item => renderRow(item, false)).join('');
                pDiv.innerHTML += `<table class="ledger-table">
                        <thead>
                            <tr>
                                <th style="width:30%;">Item</th>
                                <th style="width:15%;">Rate/Type</th>
                                <th style="width:25%;">Details</th>
                                <th style="width:10%;"></th>
                                <th style="text-align:right;">Cost</th>
                                <th style="width:10%;"></th>
                            </tr>
                        </thead>
                        <tbody>${expRows}</tbody>
                    </table>`;
            } else {
                pDiv.innerHTML += `<div style="padding:20px; color:#999; font-style:italic;">No expenses added.</div>`;
            }

            // 5. PHASE TOTALS FOOTER
            pDiv.innerHTML += `<div style="padding:15px; background:#fafafa; border-top:1px solid #ddd; margin-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="color:#666;">Labor Subtotal:</span>
                    <span style="font-weight:bold;">$${totalLaborCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                ${totalExpenseCost > 0 ? `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <span style="color:#666;">Expenses Subtotal:</span>
                    <span style="font-weight:bold;">$${totalExpenseCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>` : ''}
                 <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #ccc; padding-top:10px; margin-top:5px; font-size:1.1rem;">
                    <span style="font-weight:bold;">PHASE TOTAL:</span>
                    <span style="font-weight:bold; color:#2c3e50;">$${phaseTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
            </div>`;
            // (End of Table Generaton)
            // Removed erroneous closing brace for the deleted IF block

            container.appendChild(pDiv);

            console.log("DEBUG: Rendered Phase", phase.name);
        });

    } catch (e) {
        console.error("RENDER ERROR:", e);
        container.innerHTML += `<div style="color:red; padding:20px; border:1px solid red; background:#ffe;">
            <strong>Rendering Error:</strong> ${e.message}<br>
            <small>${e.stack}</small>
        </div>`;
    }
}

function calculateAndRenderTotals(project, usersMap) {
    let totalIdeal = 0;
    let totalConfirmed = 0;
    let equityTotal = 0;
    let equityByMember = {};
    window._mathLogs = {};

    (project.phases || []).forEach(p => {
        if (p.active === false) return; // V89: Skip Inactive Phases
        (p.lineItems || []).forEach(i => {
            let actualCost = 0;
            // Calculate Actual Cost (Confirmed)
            if (i.method === 'LumpSum') actualCost = BudgetEngine.safeFloat(i.amount);
            else if (i.method === 'Time') actualCost = BudgetEngine.safeFloat(i.count) * BudgetEngine.safeFloat(i.duration) * BudgetEngine.safeFloat(i.rate);
            else actualCost = BudgetEngine.safeFloat(i.count) * BudgetEngine.safeFloat(i.rate);

            totalConfirmed += actualCost;

            // Start Ideal with Actual, then override if Labor
            let idealCost = actualCost;

            if (i.assignee) {
                const user = usersMap[i.assignee];
                if (user && user.independentProfile) {
                    let goalRate = 0;
                    if (window.BudgetEngine) {
                        const rates = window.BudgetEngine.getWorkerRates(user.independentProfile);
                        goalRate = rates.goal || 0;
                    }

                    let actualRate = 0;
                    let hours = 0;

                    // V111: Consolidated Hours & Rate Logic for Time AND LumpSum
                    if (i.method === 'Time' || i.method === 'LumpSum') {

                        // 1. Calculate HOURS
                        if (i.method === 'Time') {
                            const unit = i.unit || 'Hours';
                            const dur = BudgetEngine.safeFloat(i.duration);
                            const count = BudgetEngine.safeFloat(i.count) || 1;
                            if (unit === 'Hours') hours = dur * count;
                            else if (unit === 'Days') hours = dur * 8 * count;
                            else if (unit === 'Weeks') hours = dur * 40 * count;

                            // Actual Rate Logic (Time)
                            if (i.rateMode === 'flat') {
                                // Imputed Rate
                                if (hours > 0) actualRate = actualCost / hours;
                            } else {
                                actualRate = BudgetEngine.safeFloat(i.rate);
                            }

                        } else if (i.method === 'LumpSum') {
                            // LumpSum Logic (using V107 Schedule Columns)
                            const lWeeks = BudgetEngine.safeFloat(i.count); // stored as count
                            const lHours = BudgetEngine.safeFloat(i.duration); // stored as duration
                            if (lWeeks > 0 && lHours > 0) {
                                hours = lWeeks * lHours;
                                actualRate = actualCost / hours; // Imputed Rate
                            }
                        }
                    }

                    // Ideal = Hours * Goal Rate
                    if (hours > 0 && goalRate > 0) {
                        idealCost = hours * goalRate;
                    }

                    totalIdeal += idealCost;

                    if (hours > 0 && goalRate > actualRate) {
                        const gap = goalRate - actualRate;
                        const equityValue = gap * hours;
                        equityTotal += equityValue;
                        const logKey = `equity_${i.assignee}`;
                        if (!window._mathLogs[logKey]) {
                            window._mathLogs[logKey] = [
                                `<strong>Calculation Log for ${user.name || i.assignee}</strong>`,
                                `Role: ${user.role || 'Collaborator'}`,
                                `Goal Rate: $${goalRate.toFixed(2)}/hr (Source: Independent Profile)`,
                                `----------------------------------------`
                            ];
                        }
                        window._mathLogs[logKey].push(
                            `<strong>Line Item: ${i.name}</strong><br>` +
                            `Hours: ${hours.toFixed(1)} hrs | Pay Rate: $${actualRate.toFixed(2)}/hr<br>` +
                            `Gap: $${gap.toFixed(2)}/hr (Goal - Pay)<br>` +
                            `Equity: $${gap.toFixed(2)} x ${hours.toFixed(1)} = <strong>$${equityValue.toFixed(2)}</strong>`
                        );
                        if (!equityByMember[i.assignee]) equityByMember[i.assignee] = 0;
                        equityByMember[i.assignee] += equityValue;
                    }
                }
            }
        });
    });

    // V112: Tiered Income Calculation
    let incConfirmed = 0;
    let incLikely = 0;
    let incNotLikely = 0;

    const fundList = document.getElementById('funding-list');
    if (fundList) fundList.innerHTML = '';

    if (project.incomeSources && project.incomeSources.length > 0) {
        project.incomeSources.forEach(src => {
            let val = BudgetEngine.safeFloat(src.amount);
            const status = src.status || 'Not Likely'; // Default

            if (status === 'Confirmed') incConfirmed += val;
            else if (status === 'Likely') incLikely += val;
            else incNotLikely += val;

            if (fundList) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${src.name}</td><td>${status}</td><td>$${val.toLocaleString()}</td><td><button class="btn-text-action" onclick="window.editFundingSource('${src.id}')">Edit</button></td>`;
                fundList.appendChild(tr);
            }
        });
    } else if (fundList) {
        fundList.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">No funding sources added.</td></tr>';
    }

    // V115: Global Expenses Display
    const elGlobalExp = document.getElementById('dash-global-expenses');
    if (elGlobalExp) {
        elGlobalExp.textContent = '$' + totalConfirmed.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    // Define Scenario Totals
    // 1. Confirmed
    const totalIncConfirmed = incConfirmed;
    updateScenario('confirmed', totalConfirmed, totalIncConfirmed, equityTotal);

    // 2. Possible
    const totalIncPossible = incConfirmed + incLikely;
    updateScenario('possible', totalConfirmed, totalIncPossible, equityTotal);

    // 3. Ideal
    const totalIncIdeal = incConfirmed + incLikely + incNotLikely;
    updateScenario('ideal', totalConfirmed, totalIncIdeal, equityTotal);

    // ... (Pie Chart Logic untouched) ... 
    // Wait, need to check if updateScenario definition is below. Yes it is closure scope.

    // ...

    function updateScenario(type, cost, income, equityLiability) {
        const netProfit = income - cost;
        const netAfterDist = Math.max(0, netProfit - equityLiability);

        // 1. Main Number: Net Profit
        const elNet = document.getElementById(`dash-${type}-net`);
        if (elNet) {
            elNet.textContent = '$' + netProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            elNet.style.color = netProfit >= 0 ? '#28a745' : '#dc3545'; // Green vs Red
        }

        // 2. Total Income (Renamed from Gross Profit)
        const elIncome = document.getElementById(`dash-${type}-income`);
        if (elIncome) {
            elIncome.textContent = '$' + income.toLocaleString(undefined, { minimumFractionDigits: 0 });
        }

        // 3. Net After Distributions (New Metric)
        const elDistNet = document.getElementById(`dash-${type}-dist-net`);
        if (elDistNet) {
            elDistNet.textContent = '$' + netAfterDist.toLocaleString(undefined, { minimumFractionDigits: 0 });
            elDistNet.style.color = netAfterDist >= 0 ? '#28a745' : '#dc3545';

            // Append Info Icon
            const infoBtn = document.createElement('span');
            infoBtn.innerHTML = ' ℹ️';
            infoBtn.style.cursor = 'pointer';
            infoBtn.title = 'View Distribution Details';
            infoBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.renderDistributionModal(type, netProfit, income);
            };
            elDistNet.appendChild(infoBtn);
        }
    }

    const shareBody = document.getElementById('shares-table-body');
    const pieChart = document.getElementById('shares-pie-chart');
    if (shareBody && project.teamMembers && project.teamMembers.length > 0) {
        shareBody.innerHTML = '';
        let pool = equityTotal;
        if (pool <= 0) pool = 1;
        let segments = [];
        let startDeg = 0;
        project.teamMembers.forEach((m, idx) => {
            const name = m.name || m.username || m.email;
            const identifier = m.email || m.username;
            const earnedEquity = equityByMember[identifier] || 0;
            const pct = pool > 0 ? ((earnedEquity / pool) * 100).toFixed(1) : 0;
            const logKey = `equity_${identifier}`;
            const hasLog = window._mathLogs && window._mathLogs[logKey] && window._mathLogs[logKey].length > 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
            <td>${name}</td>
            <td>${m.role || 'Collaborator'}</td>
            <td style="font-weight:bold;">$${earnedEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>${pct}%</td>
            <td style="text-align:center;">
                ${hasLog ? `<button class="btn-text-action btn-math-log" data-key="${logKey}" style="font-size:1.2rem; cursor:pointer;">ℹ️</button>` : '-'}
            </td>`;
            shareBody.appendChild(tr);
            const slice = earnedEquity / pool;
            const deg = slice * 360;
            const color = getColor(idx);
            segments.push(`${color} ${startDeg}deg ${startDeg + deg}deg`);
            startDeg += deg;
        });
        if (pieChart) pieChart.style.background = `conic-gradient(${segments.join(', ')})`;

    } else if (shareBody) {
        shareBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No team members found.</td></tr>';
        if (pieChart) pieChart.style.background = '#eee';
    }

    // Update Footer Total logic
    const elEquityTotal = document.getElementById('shares-total-equity');
    if (elEquityTotal) {
        elEquityTotal.textContent = '$' + equityTotal.toLocaleString(undefined, { minimumFractionDigits: 2 });
    }
    // V116: Expose Equity Data Global for Distribution Modal
    window._equityByMember = equityByMember;
    window._totalEquityLiability = equityTotal;
    window._lastEquityTotal = equityTotal;


}

// V116: Distribution Modal Logic
// V116: Distribution Modal Logic
window.renderDistributionModal = (scenarioType, netProfit, income) => {
    const modal = document.getElementById('modal-distribution');
    if (!modal) return;

    const equityTotal = window._totalEquityLiability || 0;
    const equityByMember = window._equityByMember || {};
    const project = window._project;

    // Logic:
    // Distributable Profit is capped at Total Liability
    // If NetProfit < 0, Distributable is 0.
    // If NetProfit > Liability, Distributable is Liability. (Surplus goes to Net After Dist).

    let distributable = 0;
    if (netProfit > 0) {
        distributable = Math.min(netProfit, equityTotal);
    }

    // Render Modal Header/Summary
    // V119: Show Actual Total Income
    const incomeVal = income !== undefined ? income : 0;
    document.getElementById('dist-income').textContent = '$' + incomeVal.toLocaleString(undefined, { minimumFractionDigits: 0 });
    // User interface has: Income | Expenses | Liability | Distributable
    // I need to populate these.
    // For now, let's focus on the Table as requested.

    document.getElementById('dist-liability').textContent = '$' + equityTotal.toLocaleString();
    document.getElementById('dist-distributable').textContent = '$' + distributable.toLocaleString();
    document.getElementById('dist-actual-profit').textContent = '$' + Math.max(0, netProfit - equityTotal).toLocaleString(); // Remaining Surplus

    const tbody = document.getElementById('dist-list');
    tbody.innerHTML = '';

    if (project.teamMembers) {
        project.teamMembers.forEach(m => {
            const id = m.email || m.username;
            const owed = equityByMember[id] || 0;

            // Share % of Total Liability
            let sharePct = 0;
            if (equityTotal > 0) sharePct = owed / equityTotal;

            // Payout Calculation
            const payout = distributable * sharePct;

            // Remaining Due
            const remaining = Math.max(0, owed - payout);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${m.name || m.username}</td>
                <td>${(sharePct * 100).toFixed(1)}%</td>
                <td>$${owed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style="color:green; font-weight:bold;">$${payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style="color:#666;">$${remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    modal.style.display = 'flex';
};
// Global Math Log Helper (Moved out)
window.openMathLog = (key) => {
    console.log("Opening log for:", key);
    const modal = document.getElementById('math-log-modal');
    const body = document.getElementById('math-log-body');
    if (!modal || !body) { console.error("Modal not found"); return; }

    const logs = window._mathLogs ? window._mathLogs[key] : [];
    if (!logs || logs.length === 0) {
        body.innerHTML = '<p>No calculation details available.</p>';
    } else {
        body.innerHTML = logs.map(line => `<div style="margin-bottom:5px; border-bottom:1px dashed #eee; padding-bottom:2px;">${line}</div>`).join('');
    }
    modal.style.display = 'flex';
};

function getColor(idx) {
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
    return colors[idx % colors.length];
}

function setupGlobalRates() {
    const project = window._project;
    if (!project) return;
    if (!project.settings) project.settings = {};

    const payInput = document.getElementById('project-global-pay-rate');
    const expInput = document.getElementById('project-global-expense-rate');
    const minModInput = document.getElementById('project-min-mod');
    const maxModInput = document.getElementById('project-max-mod');

    if (payInput) payInput.value = project.settings.globalPayRate || 100;
    if (expInput) expInput.value = project.settings.globalExpenseRate || 100;
    if (minModInput) minModInput.value = project.settings.minMod || 100;
    if (maxModInput) maxModInput.value = project.settings.maxMod || 100;

    const saveSettings = async () => {
        if (!project.settings) project.settings = {};
        if (payInput) project.settings.globalPayRate = parseFloat(payInput.value) || 100;
        if (expInput) project.settings.globalExpenseRate = parseFloat(expInput.value) || 100;
        if (minModInput) project.settings.minMod = parseFloat(minModInput.value) || 100;
        if (maxModInput) project.settings.maxMod = parseFloat(maxModInput.value) || 100;

        await Store.saveProject(project);
        console.log("Settings Saved");
        renderTeamPool(project, window._usersMap || {});
    };

    [payInput, expInput, minModInput, maxModInput].forEach(el => {
        if (el) el.addEventListener('change', saveSettings);
    });
}

function renderTeamPool(project, usersMap) {
    const tbody = document.getElementById('team-pool-list');
    if (!tbody) return;
    tbody.innerHTML = '';

    let highNow = 0;
    let lowGoal = Infinity;

    const members = project.teamMembers || [];
    let allMembers = [...members];
    if (project.owner) {
        if (!allMembers.find(m => (m.email || m.username) === project.owner)) {
            allMembers.push({ email: project.owner, role: 'Owner' });
        }
    }

    // V136: Aggressive Deduplication & Auto-Cleanup
    const seenIds = new Set();
    const uniqueMembers = [];
    let duplicatesFound = false;

    // Helper to resolve canonical ID
    const resolveCanonicalId = (rawId) => {
        if (!rawId) return null;
        let id = rawId.trim().toLowerCase();
        // Try to resolve via map (handle alias vs email)
        const user = usersMap[rawId] || usersMap[id];
        if (user) {
            // Prefer email if available, else username
            return (user.email || user.username || id).toLowerCase();
        }
        return id;
    };

    // 1. Dedupe Local List (allMembers includes Owner)
    // We actually want to clean project.teamMembers first
    const cleanTeamMembers = [];
    const teamSeen = new Set();

    (project.teamMembers || []).forEach(m => {
        const rawId = m.email || m.username;
        const canonId = resolveCanonicalId(rawId);
        if (canonId && !teamSeen.has(canonId)) {
            teamSeen.add(canonId);
            cleanTeamMembers.push(m);
        } else {
            console.warn(`Duplicate Member in Data: ${rawId} (Canon: ${canonId})`);
            duplicatesFound = true;
        }
    });

    if (duplicatesFound) {
        console.log("Auto-Fixing Project Data: Removing duplicates...");
        project.teamMembers = cleanTeamMembers;
        Store.saveProject(project).then(() => console.log("Project Cleaned Saved"));
    }

    // 2. Rebuild Display List
    allMembers = [...cleanTeamMembers];
    if (project.owner) {
        const ownerCanon = resolveCanonicalId(project.owner);
        if (!teamSeen.has(ownerCanon)) {
            allMembers.push({ email: project.owner, role: 'Owner' });
        }
    }

    allMembers.forEach(m => {
        const id = m.email || m.username;
        const user = usersMap[id];
        if (user && user.independentProfile) {
            const rates = BudgetEngine.getWorkerRates(user.independentProfile);
            if (rates.now > highNow) highNow = rates.now;
            if (rates.goal > 0 && rates.goal < lowGoal) lowGoal = rates.goal;
        }
    });
    if (lowGoal === Infinity) lowGoal = 0;

    const inpMin = document.getElementById('project-min-mod');
    const inpMax = document.getElementById('project-max-mod');
    const minMod = parseFloat(inpMin?.value) || 100;
    const maxMod = parseFloat(inpMax?.value) || 100;

    let projectMin = highNow * (minMod / 100);
    let rawMax = lowGoal * (maxMod / 100);

    // CONSTRAINT: Final Max cannot be lower than Final Min OR Base Min (High Now)
    // "whichever is higher"
    const floor = Math.max(projectMin, highNow);
    let projectMax = Math.max(rawMax, floor);

    const elMin = document.getElementById('pool-min-wage');
    const elMax = document.getElementById('pool-max-wage');
    if (elMin) elMin.textContent = `$${projectMin.toFixed(2)}/hr`;
    if (elMax) elMax.textContent = `$${projectMax.toFixed(2)}/hr`;

    // PERSISTENCE CHECK:
    // Ensure these calculated values are stored in project.globalRates if not already
    // This runs on every render, but we only want to save if inputs change.
    // So we attach listeners below.
    // Event Listeners attached if needed
    if (inpMin && !inpMin.onchange) {
        inpMin.onchange = async () => {
            // Recalc and Save
            await window.saveGlobalCaps();
        }
    }
    if (inpMax && !inpMax.onchange) {
        inpMax.onchange = async () => {
            await window.saveGlobalCaps();
        }
    }

    if (allMembers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No members in pool.</td></tr>';
        return;
    }

    allMembers.forEach(m => {
        const id = m.email || m.username;
        const user = usersMap[id] || {};
        const name = user.name || m.name || id;
        const role = m.role || user.role || 'Collaborator';

        let ratesStr = '-';
        if (user.independentProfile) {
            const r = BudgetEngine.getWorkerRates(user.independentProfile);
            ratesStr = `$${r.now.toFixed(2)} / $${r.goal.toFixed(2)}`;
        } else {
            ratesStr = '<span style="color:red">Profile Missing</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${name}</td>
            <td>${role}</td>
            <td>${ratesStr}</td>
            <td>${ratesStr}</td>
            <td><button class="btn-text-action" onclick="Wizard.openEditMember('${id}')">Edit</button></td>
         `;
        tbody.appendChild(tr);
    });
}

// --- Helper for Phase Details ---
window.updatePhaseDetail = async (phaseId, field, value) => {
    const project = window.Wizard.project || window._project;
    if (!project) return;
    const phase = project.phases.find(p => p.id === phaseId);
    if (!phase) return;

    if (field === 'rateMode') {
        phase[field] = value; // String
    } else {
        phase[field] = parseFloat(value) || 0;
    }

    await Store.saveProject(project);
    console.log(`Phase ${phase.name} updated: ${field} = ${value} `);
    // Re-render dashboard to reflect changes, especially if rateMode changed
    renderDashboard(project, window._usersMap || {}, []);
    renderDashboard(project, window._usersMap || {}, []);
};

// V91: Use Custom Modal for Phase Delete
window.deletePhase = async (phaseId) => {
    // 1. Setup Pending Action
    Wizard.pendingConfirm = {
        type: 'deletePhase',
        phaseId: phaseId
    };

    // 2. Update Modal UI
    const msgEl = document.getElementById('confirm-message');
    const modalEl = document.getElementById('modal-confirm-action');
    if (msgEl && modalEl) {
        msgEl.innerText = "Delete this phase? This cannot be undone.";
        modalEl.style.display = 'block';
    }
};

// V123: Duplicate Phase Logic
window.duplicatePhase = async (phaseId) => {
    const project = window.Wizard.project || window._project;
    if (!project) return;

    // 1. Find Original
    const originalPhase = project.phases.find(p => p.id === phaseId);
    if (!originalPhase) return;

    if (!confirm(`Duplicate phase "${originalPhase.name}"?`)) return;

    // 2. Deep Copy
    const newPhase = JSON.parse(JSON.stringify(originalPhase));

    // 3. Update Phase Metadata
    newPhase.id = 'ph_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    newPhase.name = "Copy of " + originalPhase.name;

    // 4. Regenerate Item IDs
    // Labor Items
    if (newPhase.items && newPhase.items.length > 0) {
        newPhase.items.forEach(item => {
            item.id = 'li_' + Math.random().toString(36).substr(2, 9);
        });
    }
    // Expense Items
    if (newPhase.expenseItems && newPhase.expenseItems.length > 0) {
        newPhase.expenseItems.forEach(item => {
            item.id = 'exp_' + Math.random().toString(36).substr(2, 9);
        });
    }

    // 5. Append
    project.phases.push(newPhase);

    // 6. Save & Render
    await Store.saveProject(project);
    console.log(`Phase Duplicated: ${newPhase.name}`);
    renderDashboard(project, window._usersMap || {}, []);
};

window.togglePhaseActive = async (phaseId, isActive) => {
    const project = window.Wizard.project || window._project;
    if (!project) return;
    const phase = project.phases.find(p => p.id === phaseId);
    if (!phase) return;

    phase.active = isActive;
    console.log(`Phase '${phase.name}' set to ${isActive ? 'Active' : 'Inactive'}`);

    await Store.saveProject(project);
    location.reload();
};


// Global Exports verification
window.Wizard = Wizard;

// --- 4. Micro-Modal Logic (Schedule, Rate, Overhead) ---

window.openScheduleModal = (phaseId, itemId) => {
    console.log("Opening Schedule Modal", phaseId, itemId);
    const p = window._project.phases.find(ph => ph.id === phaseId);
    if (!p) return;
    const item = p.lineItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('sched-phase-id').value = phaseId;
    document.getElementById('sched-item-id').value = itemId;

    // Determine current mode
    let mode = item.schedMode || 'custom';
    if (!item.schedMode) mode = 'custom'; // Default legacy

    // Update labels
    // Determine user cap for display
    let userCap = p.hours || 40; // fallback
    let debugStr = '';
    const user = window._usersMap ? window._usersMap[item.assignee] : null;
    if (user && user.independentProfile) {
        const capData = window.Utils.calculateBillableCapacity(user.independentProfile);
        const ratio = capData.billableRatio || 1.0;
        const s = user.independentProfile.schedule || {};
        const totalWeekly = (parseFloat(s.hours) || 0) * (parseFloat(s.days) || 0);
        userCap = (totalWeekly * ratio).toFixed(1);
        debugStr = ` [${totalWeekly} hr * ${(ratio * 100).toFixed(0)}%]`;
        console.log("DEBUG SCHEDULE:", { user: user.username, totalWeekly, ratio, userCap, debugStr });
    } else {
        console.log("DEBUG SCHEDULE: No profile found for", item.assignee);
    }

    const phWeeks = p.weeks || 50;
    const phHours = p.hours || 40;
    document.getElementById('lbl-phase-sched').textContent = `${phWeeks} wks x ${phHours} hrs`;
    document.getElementById('lbl-curbed-sched').textContent = `Max Cap. (${userCap} hrs / wk)${debugStr} `;

    // Set Radio
    const radios = document.getElementsByName('sched_mode');
    radios.forEach(r => {
        r.checked = (r.value === mode);
        r.onclick = () => {
            document.getElementById('sched-custom-inputs').style.display = (r.value === 'custom') ? 'block' : 'none';
            document.getElementById('sched-total-inputs').style.display = (r.value === 'total') ? 'block' : 'none';
        }
    });

    // Inputs
    document.getElementById('sched-custom-weeks').value = item.count || phWeeks;
    document.getElementById('sched-custom-hours').value = item.duration || phHours;
    document.getElementById('sched-custom-inputs').style.display = (mode === 'custom') ? 'block' : 'none';

    document.getElementById('sched-total-hours').value = (mode === 'total') ? item.duration : (phWeeks * phHours);
    document.getElementById('sched-total-inputs').style.display = (mode === 'total') ? 'block' : 'none';

    document.getElementById('modal-edit-schedule').style.display = 'block';
};

window.saveScheduleEdit = async () => {
    const phaseId = document.getElementById('sched-phase-id').value;
    const itemId = document.getElementById('sched-item-id').value;
    const mode = document.querySelector('input[name="sched_mode"]:checked').value;

    const p = window._project.phases.find(ph => ph.id === phaseId);
    const item = p.lineItems.find(i => i.id === itemId);

    item.schedMode = mode;

    if (mode === 'phase') {
        item.count = p.weeks || 50;
        item.duration = p.hours || 40;
    } else if (mode === 'curbed') {
        const phWeeks = p.weeks || 50;
        const phHours = p.hours || 40;

        item.count = phWeeks;

        // Recalculate Curbed Value
        let userCap = phHours;
        const user = window._usersMap ? window._usersMap[item.assignee] : null;
        if (user && user.independentProfile) {
            const capData = window.Utils.calculateBillableCapacity(user.independentProfile);
            const ratio = capData.billableRatio || 1.0;
            const s = user.independentProfile.schedule || {};
            const totalWeekly = (parseFloat(s.hours) || 0) * (parseFloat(s.days) || 0);
            userCap = totalWeekly * ratio;
        }
        item.duration = Math.min(phHours, userCap).toFixed(1);

    } else if (mode === 'total') {
        const total = parseFloat(document.getElementById('sched-total-hours').value) || 0;
        const max = (p.weeks || 50) * (p.hours || 40);

        // Strict Validation: Capacity
        if (total > max) {
            alert(`Total Hours cannot exceed Phase capacity (${max} hrs).`);
            return; // Block Save
        }

        item.duration = total;
        item.count = p.weeks || 50; // Reference weeks for calculation, though largely symbolic in Total mode

    } else {
        const valWeeks = parseFloat(document.getElementById('sched-custom-weeks').value) || 0;
        const valHours = parseFloat(document.getElementById('sched-custom-hours').value) || 0;

        // Strict Validation: Phase Weeks
        const maxWeeks = parseFloat(p.weeks) || 50;
        if (valWeeks > maxWeeks) {
            alert(`Custom Weeks (${valWeeks}) cannot exceed Phase duration (${maxWeeks} weeks).`);
            return; // Block Save
        }

        // Strict Validation: Phase Hours (Per Week)
        const maxHoursPerWeek = parseFloat(p.hours) || 40;
        if (valHours > maxHoursPerWeek) {
            alert(`Custom Hours (${valHours}) cannot exceed Phase Hours (${maxHoursPerWeek} hrs/wk).`);
            return; // Block Save
        }

        item.count = valWeeks;
        item.duration = valHours;
    }

    await Store.saveProject(window._project);
    document.getElementById('modal-edit-schedule').style.display = 'none';
    location.reload();
};

window.openRateModal = (phaseId, itemId) => {
    console.log("Opening Rate Modal", phaseId, itemId);
    const p = window._project.phases.find(ph => ph.id === phaseId);
    if (!p) return;
    const item = p.lineItems.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('rate-phase-id').value = phaseId;
    document.getElementById('rate-item-id').value = itemId;

    // Determine current mode
    let mode = item.rateMode || 'custom';

    // Labels
    const phRate = 50; // Placeholder or Default?
    const user = window._usersMap ? window._usersMap[item.assignee] : null;
    let goalRate = 0;
    if (user && user.independentProfile) {
        const rates = window.BudgetEngine.getWorkerRates(user.independentProfile);
        goalRate = rates.goal;
    }
    document.getElementById('lbl-phase-rate').textContent = 'Default';
    document.getElementById('lbl-goal-rate').textContent = `$${goalRate.toFixed(2)} `;

    // Set Radio
    const radios = document.getElementsByName('rate_mode');
    radios.forEach(r => {
        r.checked = (r.value === mode);
        r.onchange = () => {
            document.getElementById('rate-custom-inputs').style.display = (r.value === 'custom') ? 'block' : 'none';
            document.getElementById('rate-flat-inputs').style.display = (r.value === 'flat') ? 'block' : 'none';
        }
    });

    document.getElementById('rate-custom-val').value = item.rate;
    document.getElementById('rate-flat-val').value = item.flatFee || ''; // Store flat fee separately if possible or derive

    document.getElementById('rate-custom-inputs').style.display = (mode === 'custom') ? 'block' : 'none';
    document.getElementById('rate-flat-inputs').style.display = (mode === 'flat') ? 'block' : 'none';

    document.getElementById('modal-edit-rate').style.display = 'block';
};

window.saveRateEdit = async () => {
    const phaseId = document.getElementById('rate-phase-id').value;
    const itemId = document.getElementById('rate-item-id').value;
    const mode = document.querySelector('input[name="rate_mode"]:checked').value;

    const p = window._project.phases.find(ph => ph.id === phaseId);
    const item = p.lineItems.find(i => i.id === itemId);

    item.rateMode = mode;

    // Helper to get Project Caps
    const getProjectCaps = () => {
        const project = window.Wizard.project || window._project;
        // Check multiple paths for settings
        let minW = 0, maxW = 9999;
        if (project.globalRates) {
            minW = parseFloat(project.globalRates.minWage) || 0;
            maxW = parseFloat(project.globalRates.maxWage) || 9999;
        } else if (project.settings) {
            minW = parseFloat(project.settings.projectMin) || 0;
            maxW = parseFloat(project.settings.projectMax) || 9999;
        }
        return { min: minW, max: maxW };
    };

    if (mode === 'goal') {
        // Re-fetch goal
        const user = window._usersMap ? window._usersMap[item.assignee] : null;
        if (user) {
            const rates = window.BudgetEngine.getWorkerRates(user.independentProfile);
            let goal = rates.goal;
            const caps = getProjectCaps();
            if (goal < caps.min) goal = caps.min;
            if (goal > caps.max) goal = caps.max;
            item.rate = goal.toFixed(2);
        }
    } else if (mode === 'phase') {
        // Enforce Caps on Phase Rate too? 
        // If Phase Rate is overridden, it's specific. But if it's "Default Phase Rate", it comes from Project.
        // User said: "phase rates ... should be limited by the project min and max"
        // Assuming current stored rate IS the phase rate.
        const caps = getProjectCaps();
        let r = parseFloat(item.rate);
        if (r < caps.min) r = caps.min;
        if (r > caps.max) r = caps.max;
        item.rate = r.toFixed(2);
    } else if (mode === 'custom') {
        item.rate = document.getElementById('rate-custom-val').value;
    } else if (mode === 'flat') {
        // Calculate effective hourly
        const totalFee = parseFloat(document.getElementById('rate-flat-val').value) || 0;
        item.flatFee = totalFee;
        const weeks = parseFloat(item.count) || p.weeks || 50;
        const hours = parseFloat(item.duration) || p.hours || 40;
        const totalHours = weeks * hours;
        item.rate = totalHours > 0 ? (totalFee / totalHours).toFixed(2) : 0;
    }

    await Store.saveProject(window._project);
    document.getElementById('modal-edit-rate').style.display = 'none';
    location.reload();
};

window.openOverheadModal = async (phaseId, itemId, assigneeId) => {
    try {
        console.log("Opening Overhead Modal", phaseId, itemId, assigneeId);
        document.getElementById('oh-phase-id').value = phaseId;
        document.getElementById('oh-item-id').value = itemId;

        const list = document.getElementById('oh-business-list');
        list.innerHTML = 'Loading overheads...';

        // 1. Get User
        const currentUser = await Store.getCurrentUser();
        const user = window._usersMap ? window._usersMap[assigneeId] : null;

        // V79: FETCH FULL PROFILE!
        // currentUser only has Auth info. We need the actual profile blob for LinesOfWork.
        let fullProfile = null;
        if (currentUser) {
            try {
                // If I am the assignee, fetch *my* profile from DB
                // Or if we are viewing someone else, we rely on _usersMap (which might be incomplete?)
                // For "Me", always fetch fresh.
                const isMe = (currentUser.email === assigneeId || currentUser.id === assigneeId);
                if (isMe) {
                    fullProfile = await Store.getIndependentProfile();
                    // console.log("Fetched Full Profile for Overhead:", fullProfile);
                } else if (user && user.independentProfile) {
                    fullProfile = user.independentProfile;
                }
            } catch (err) { console.error("Profile Fetch Error", err); }
        }

        let availableOverheads = [];

        // 2. If Assignee is Me, fetch my Overhead Projects
        const isMe = (currentUser && (currentUser.email === assigneeId || currentUser.id === assigneeId || (user && user.email === currentUser.email)));

        if (isMe) {
            try {
                const projects = await Store.getOverheadProjects();
                console.log("Fetched Overhead Projects:", projects);
                projects.forEach(p => {
                    // Sum expenses
                    const total = (p.expenses || []).reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
                    availableOverheads.push({
                        id: p.id,
                        name: p.name, // Business Name
                        amount: total.toFixed(2),
                        frequency: 'yr' // Projects are usually Annual budgets
                    });
                });
            } catch (err) {
                console.error("Error fetching overhead projects:", err);
            }
        }

        // 3. Also check Profile (Legacy or Manual)
        if (user && user.independentProfile && Array.isArray(user.independentProfile.overhead)) {
            user.independentProfile.overhead.forEach(oh => {
                // Avoid duplicates if possible?
                availableOverheads.push(oh);
            });
        }

        // Render
        list.innerHTML = '';
        if (availableOverheads.length === 0) {
            list.innerHTML = '<p style="color:#666; font-style:italic;">No overhead businesses found. Go to Dashboard > Overhead to create one.</p>';
        }

        // Get Current Line Item to check boxes
        let currentSelections = [];
        const p = window._project.phases.find(ph => ph.id === phaseId);
        if (p) {
            const item = p.lineItems.find(i => i.id === itemId);
            if (item && item.overheadSelections) currentSelections = item.overheadSelections;
        }

        // 3.5 Calculate Defaults (Total Capacity)
        let totalBillableHours = 2000;
        // Move profile definition UP
        const profile = currentUser ? currentUser.independentProfile : null;

        if (currentUser && currentUser.independentProfile && window.Utils && window.Utils.calculateBillableCapacity) {
            const capData = window.Utils.calculateBillableCapacity(currentUser.independentProfile);
            totalBillableHours = capData.totalBillableHours || 2000;
        }

        // USE fullProfile for matching
        const matchingProfile = fullProfile;

        availableOverheads.forEach((biz, idx) => {
            const div = document.createElement('div');
            const bizId = biz.id || biz.name;

            // MATCHING LOGIC
            let linkedRate = 0;
            if (matchingProfile && matchingProfile.linesOfWork) {
                const linkedLine = matchingProfile.linesOfWork.find(l => String(l.overheadProjectId) === String(bizId)); // String cast for safety
                if (linkedLine && linkedLine.derivedOverheadRate) {
                    linkedRate = parseFloat(linkedLine.derivedOverheadRate);
                }
            }

            div.style.marginBottom = '5px';
            const isChecked = currentSelections.includes(bizId) ? 'checked' : '';

            // V75: DEBUG PROFILE STRUCTURE
            // console.log("Debug Profile for " + biz.name, profile);
            if (idx === 0) {
                window.logToUI("DEBUG: Checking Profile for Linked Rates...");
                if (profile && profile.linesOfWork) window.logToUI("Lines Found: " + profile.linesOfWork.length);
                if (profile && profile.overhead) window.logToUI("Overhead Found: " + profile.overhead.length);
            }

            // V77: Find "Linked Overhead Rate" from Profile's Line of Work
            // The Independent Tool stores the rate as 'derivedOverheadRate' on the Line of Work that owns this overhead project.
            // let linkedRate = 0; // This is now declared and potentially set in the debug block above
            if (profile && profile.linesOfWork) {
                // Find the line that uses this overhead project
                const linkedLine = profile.linesOfWork.find(l => l.overheadProjectId === bizId);
                if (linkedLine && linkedLine.derivedOverheadRate) {
                    linkedRate = parseFloat(linkedLine.derivedOverheadRate);
                    // console.log(`DEBUG: Found Linked Rate for ${biz.name}: $${linkedRate}`);
                }
            }

            // Fallback Calculation (if not linked)
            const annualCost = parseFloat(biz.amount) || 0;
            // Use Total Billable for fallback calculation if no specific line linked
            let fallbackRate = (totalBillableHours > 0) ? (annualCost / totalBillableHours) : 0;

            let hourlyRate = (linkedRate > 0) ? linkedRate : fallbackRate;

            div.innerHTML = `
            <label style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:5px; border-bottom:1px solid #eee;">
                <span>
                    <input type="checkbox" class="oh-biz-check" value="${bizId}" data-rate="${hourlyRate.toFixed(2)}" onchange="window.recalcOverheadTotal()" ${isChecked}>
                    <span style="font-weight:500;">${biz.name}</span>
                </span>
                <span>$${hourlyRate.toFixed(2)}/hr <span style="font-size:0.8em; color:#888;">($${annualCost.toLocaleString()}/yr)</span></span>
            </label>`;
            list.appendChild(div);
        });

        // list.appendChild(debugPanel); // Removed erroneous debug leftover
        // debugPanel.innerHTML = debugHTML; // Removed erroneous debug leftover


        // Trigger Calc to set initial total based on checked boxes
        // Only if selections exist. If new, sum is 0.
        document.getElementById('modal-edit-overhead').style.display = 'block';
        window.recalcOverheadTotal(); // Update display immediately

    } catch (e) {
        console.error("OVERHEAD MODAL ERROR:", e);
        alert("Error opening overhead settings: " + e.message);
    }
};

window.saveGlobalCaps = async () => {
    console.log("Saving Global Caps...");
    const minMod = parseFloat(document.getElementById('project-min-mod')?.value) || 100;
    const maxMod = parseFloat(document.getElementById('project-max-mod')?.value) || 100;

    // We must recalculate the High Now / Low Goal from the pool to get the $ amount
    // Re-use logic from renderTeamPool logic if possible, or duplicate simplified logic
    let highNow = 0;
    let lowGoal = Infinity;
    const project = window._project;
    const members = project.teamMembers || [];
    const allMembers = [...members];
    if (project.owner && !allMembers.find(m => (m.email || m.username) === project.owner)) {
        allMembers.push({ email: project.owner, role: 'Owner' });
    }
    const usersMap = window._usersMap || {};

    allMembers.forEach(m => {
        const id = m.email || m.username;
        const user = usersMap[id];
        if (user && user.independentProfile) {
            const rates = window.BudgetEngine.getWorkerRates(user.independentProfile);
            if (rates.now > highNow) highNow = rates.now;
            if (rates.goal > 0 && rates.goal < lowGoal) lowGoal = rates.goal;
        }
    });

    if (lowGoal === Infinity) lowGoal = 0;

    let minWage = highNow * (minMod / 100);
    let rawMax = lowGoal * (maxMod / 100);

    // CONSTRAINT: Final Max cannot be lower than Final Min OR Base Min (High Now)
    const floor = Math.max(minWage, highNow);
    let maxWage = Math.max(rawMax, floor);

    if (!project.globalRates) project.globalRates = {};
    project.globalRates.minWage = minWage;
    project.globalRates.maxWage = maxWage;
    project.globalRates.minMod = minMod; // Save mod too if needed

    await Store.saveProject(project);
    // Update UI text immediately
    const elMin = document.getElementById('pool-min-wage');
    const elMax = document.getElementById('pool-max-wage');
    if (elMin) elMin.textContent = `$${minWage.toFixed(2)}/hr`;
    if (elMax) elMax.textContent = `$${maxWage.toFixed(2)}/hr`;

    // Reload to apply caps to table?
    location.reload();
};

// V71: Save Overhead Selections
window.saveOverheadEdit = async () => {
    const hourly = parseFloat(document.getElementById('oh-total-display').getAttribute('data-val')) || 0;
    const phaseId = document.getElementById('oh-phase-id').value;
    const itemId = document.getElementById('oh-item-id').value;
    const selectionData = [];
    document.querySelectorAll('.oh-biz-check:checked').forEach(c => {
        selectionData.push(c.value); // Value is amount? No, we need ID? 
        // We set value="${biz.amount}" previously. We need ID.
        // Updating checkboxes to use ID as value, and store amount in data attribute.
    });

    // Wait, I need to know WHICH checkboxes were checked.
    // I'll update the checkbox generation to put ID in 'value' and Amount in 'data-amount'.
    // See openOverheadModal changes below.

    const selectedIds = [];
    document.querySelectorAll('.oh-biz-check:checked').forEach(c => {
        selectedIds.push(c.value); // This will be the ID
    });

    const p = window._project.phases.find(ph => ph.id === phaseId);
    const item = p.lineItems.find(i => i.id === itemId);

    item.overheadRate = hourly;
    item.overheadSelections = selectedIds; // Save Persistence

    await Store.saveProject(window._project);
    document.getElementById('modal-edit-overhead').style.display = 'none';
    location.reload();
};

// V74: Simple Summation of Hourly Rates
window.recalcOverheadTotal = () => {
    let rateSum = 0;
    document.querySelectorAll('.oh-biz-check:checked').forEach(c => {
        // V74: We stored the Calculated Hourly Rate in data-rate
        let r = parseFloat(c.getAttribute('data-rate')) || 0;
        rateSum += r;
    });

    const hourly = rateSum;
    document.getElementById('oh-total-display').textContent = `$${hourly.toFixed(2)}`;
    document.getElementById('oh-total-display').setAttribute('data-val', hourly);
};

// Event Delegation for Math Log
document.addEventListener('click', (e) => {
    if (e.target && e.target.closest('.btn-math-log')) {
        const btn = e.target.closest('.btn-math-log');
        const key = btn.getAttribute('data-key');
        if (key) window.openMathLog(key);
    }
});

// EXPORT WIZARD GLOBALLY
window.Wizard = Wizard;

// V65: Global Event Delegation for Toggles
// V67: Global Event Delegation - Custom Modal + Debounce
let _clickLock = false;

document.addEventListener('click', (e) => {
    // Check if we clicked ANY part of a switch
    const switchEl = e.target.closest('.switch');

    if (switchEl) {
        // Find the input
        const input = switchEl.querySelector('input');

        // DEBOUNCE: If we just handled this, ignore
        if (_clickLock) {
            e.preventDefault();
            e.stopPropagation();
            console.log("Ignored Double-Click (Debounce)");
            return;
        }

        if (input && input.classList.contains('action-toggle-member')) {
            e.preventDefault();
            e.stopPropagation();

            // Lock for 500ms to prevent double-fire
            _clickLock = true;
            setTimeout(() => _clickLock = false, 500);

            const phaseId = input.getAttribute('data-phase-id');
            const memberId = input.getAttribute('data-member-id');

            console.log("Delegated Click: Toggle Member", phaseId, memberId);

            // Manually invoke
            const mockEvent = {
                preventDefault: () => { },
                stopPropagation: () => { },
                target: input
            };
            Wizard.toggleMember(phaseId, memberId, mockEvent);
            return;
        }

        if (input && input.classList.contains('action-toggle-all')) {
            e.preventDefault();
            e.stopPropagation();

            _clickLock = true;
            setTimeout(() => _clickLock = false, 500);

            const phaseId = input.getAttribute('data-phase-id');
            const mockEvent = {
                preventDefault: () => { },
                stopPropagation: () => { },
                target: input
            };
            Wizard.toggleAll(phaseId, mockEvent);
            return;
        }
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initApp(0));
} else {
    initApp(0);
}
