/**
 * Power in Numbers - Utilities
 * Utility Functions
 */

const Utils = {
    formatCurrency: (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(amount);
    },

    formatNumber: (amount) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
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

        if (profile.linesOfWork) {
            profile.linesOfWork.forEach(line => {
                const lineWeeks = Utils.Normalizer.getLineWeeks(line.duration.value, line.duration.unit, weeks);
                if (line.activities) {
                    line.activities.forEach(act => {
                        const actHours = Utils.Normalizer.getActivityAnnualHours(act, lineWeeks, days, hours);
                        if (actHours !== -1) {
                            totalNonBillableHours += actHours;
                        }
                    });
                }
            });
        }

        const totalBillableHours = Math.max(0, totalWorkHours - totalNonBillableHours);
        const billableRatio = totalWorkHours > 0 ? (totalBillableHours / totalWorkHours) : 0;

        return {
            totalWorkHours,
            totalNonBillableHours,
            totalBillableHours,
            billableRatio
        };
    }
};

window.Utils = Utils;
window.formatMoney = Utils.formatCurrency;
