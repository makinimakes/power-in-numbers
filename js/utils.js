/**
 * Power in Numbers - Utilities
 * Utility Functions
 */

const Utils = {
    formatCurrency: (amount) => {
        const num = Number(amount) || 0;
        const rounded = Math.round(num * 100) / 100;
        const isWhole = Number.isInteger(rounded);
        const formatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: isWhole ? 0 : 2,
            maximumFractionDigits: isWhole ? 0 : 2
        }).format(num);
        return '$' + formatted;
    },

    formatNumber: (amount) => {
        const num = Number(amount) || 0;
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    },

    generateId: () => {
        return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).substr(2, 9);
    },

    // Calculate Rate based on Income approach
    calculateRateFromIncome: (annualIncome, weeks, days) => {
        if (!weeks || !days) return 0;
        const totalDays = weeks * days;
        return annualIncome / totalDays;
    },

    // Calculate Income needed from Expenses approach
    calculateTotalNeeds: (expenses) => {
        return Object.values(expenses).reduce((a, b) => a + b, 0);
    },

    // Calculate Meantime Adjustment
    calculateMeantimeAdjustment: (profile) => {
        if (!profile.meantimeSelections || profile.meantimeSelections.length === 0) return 0;
        let totalAdjustmentAnnual = 0;
        profile.meantimeSelections.forEach(sel => {
            const originalItem = profile.expenses?.items?.find(i => i.id === sel.id);
            if (!originalItem) return;
            
            let freqMult = 1;
            if (originalItem.type === 'Monthly' || originalItem.type === 'Percent') freqMult = 12;
            else if (originalItem.type === 'Periodic') freqMult = parseFloat(originalItem.frequency) || 1;
            
            const currentAnnual = (sel.currentVal || 0) * freqMult;
            const goalAnnual = (sel.goalVal || 0) * freqMult;
            totalAdjustmentAnnual += (goalAnnual - currentAnnual);
        });
        return Math.max(0, totalAdjustmentAnnual);
    },

    // Normalizer Helpers (moved from independent.js)
    Normalizer: {
        getLineWeeks: (durationVal, durationUnit, globalWeeks) => {
            const val = parseFloat(durationVal) || 0;
            switch (durationUnit) {
                case 'Weeks': return val;
                case 'Months': return val * 4.333;
                case '% of Year': return (val / 100) * globalWeeks;
                default: return 0;
            }
        },
        getActivityAnnualHours: (act, lineWeeks, workDaysPerWeek, workHoursPerDay) => {
            const amount = parseFloat(act.amount) || 0;
            const E6 = workHoursPerDay;
            const E7 = workDaysPerWeek;
            const E8 = lineWeeks;
            const activeMonths = (E8 * 12) / 52;

            switch (act.unit) {
                case 'Hours':
                    switch (act.frequency) {
                        case 'Per Day': return amount * E7 * E8;
                        case 'Per Week': return amount * E8;
                        case 'Per Month': return amount * activeMonths;
                        case 'Per Year': return amount;
                    }
                    break;
                case 'Days':
                    switch (act.frequency) {
                        case 'Per Day': return -1;
                        case 'Per Week': return amount * E6 * E8;
                        case 'Per Month': return amount * E6 * activeMonths;
                        case 'Per Year': return amount * E6;
                    }
                    break;
                case 'Weeks':
                    switch (act.frequency) {
                        case 'Per Day': return -1;
                        case 'Per Week': return -1;
                        case 'Per Month': return amount * E7 * E6 * activeMonths;
                        case 'Per Year': return amount * E7 * E6;
                    }
                    break;
                case 'Months':
                    switch (act.frequency) {
                        case 'Per Day': return -1;
                        case 'Per Week': return -1;
                        case 'Per Month': return -1;
                        case 'Per Year': return amount * E7 * E6 * activeMonths;
                    }
                    break;
            }
            return 0;
        }
    },

    // Centralized Capacity Calculation
    calculateBillableCapacity: (profile) => {
        const weeks = parseFloat(profile.schedule?.weeks) || 0;
        const days = parseFloat(profile.schedule?.days) || 0;
        const hours = parseFloat(profile.schedule?.hours) || 0;

        const totalWorkDays = weeks * days;
        const totalWorkHours = totalWorkDays * hours;

        let totalNonBillableHours = 0;
        let maintenanceNonBillableHours = 0;

        // Collect billable lines for the overlap algorithm
        const billableLines = [];

        if (profile.linesOfWork) {
            profile.linesOfWork.forEach(line => {
                let lineWeeks = Utils.Normalizer.getLineWeeks(line.duration.value, line.duration.unit, weeks);
                if (lineWeeks > weeks) lineWeeks = weeks; // Cap for overlap math
                
                const isBillable = line.isBillable !== false;
                
                // Sum Non-Billable Hours (uncapped lineWeeks used here to allow 52-week maintenance)
                const rawLineWeeks = Utils.Normalizer.getLineWeeks(line.duration.value, line.duration.unit, weeks);
                let lineNonBillable = 0;
                
                if (line.activities) {
                    line.activities.forEach(act => {
                        const actHours = Utils.Normalizer.getActivityAnnualHours(act, rawLineWeeks, days, hours);
                        if (actHours !== -1) {
                            lineNonBillable += actHours;
                        }
                    });
                }
                
                totalNonBillableHours += lineNonBillable;

                if (isBillable) {
                    billableLines.push({ id: line.id, weeks: lineWeeks, nonBillable: lineNonBillable });
                } else {
                    maintenanceNonBillableHours += lineNonBillable;
                }
            });
        }

        // Remaining Baseline Work Hours = Total - Maintenance Non-Billable
        const remainingBaselineWorkHours = Math.max(0, totalWorkHours - maintenanceNonBillableHours);

        // CONCURRENT OVERLAP ALGORITHM
        // 1. Sort lines ascending by weeks
        billableLines.sort((a, b) => a.weeks - b.weeks);
        
        let previousWeeks = 0;
        const effectiveWeeksMap = {};
        billableLines.forEach(l => effectiveWeeksMap[l.id] = 0);

        for (let i = 0; i < billableLines.length; i++) {
            const currentLine = billableLines[i];
            const segmentLength = currentLine.weeks - previousWeeks;
            
            if (segmentLength > 0) {
                const activeRolesCount = billableLines.length - i;
                const portion = segmentLength / activeRolesCount;
                
                // Add portion to all currently active roles
                for (let j = i; j < billableLines.length; j++) {
                    effectiveWeeksMap[billableLines[j].id] += portion;
                }
            }
            previousWeeks = currentLine.weeks;
        }

        // Sum effective weeks to find the denominator
        const totalEffectiveWeeks = Object.values(effectiveWeeksMap).reduce((a, b) => a + b, 0);

        // Distribute Billable Hours
        const calculatedLineHours = {};
        let totalBillableHours = 0;
        
        if (totalEffectiveWeeks > 0) {
            billableLines.forEach(l => {
                const proportion = effectiveWeeksMap[l.id] / totalEffectiveWeeks;
                
                // Gross Allocated Hours based on proportion of Remaining Baseline
                const grossLineHours = remainingBaselineWorkHours * proportion;
                
                // Final Billable Hours for this line = Gross - specific non-billable
                const finalLineBillable = Math.max(0, grossLineHours - l.nonBillable);
                
                calculatedLineHours[l.id] = finalLineBillable;
                totalBillableHours += finalLineBillable;
            });
        }

        const billableRatio = totalWorkHours > 0 ? (totalBillableHours / totalWorkHours) : 0;

        return {
            totalWorkHours,
            totalNonBillableHours,
            totalBillableHours,
            billableRatio,
            calculatedLineHours
        };
    }
};

window.Utils = Utils;
window.formatMoney = Utils.formatCurrency;
