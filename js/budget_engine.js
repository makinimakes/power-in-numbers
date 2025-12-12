/**
 * Budget Engine
 * Handles complex rate calculations, scenario aggregation, and producerial shares.
 */

const BudgetEngine = {
    /**
     * Calculate Annual Rates for a Worker based on their Profile.
     * Replicates logic from calibrations.js but strictly Annualized.
     */
    getWorkerRates: (profile) => {
        if (!profile) return { now: 0, goal: 0 };

        // 1. Calculate Unearned Income Sum (Annualized)
        let unearnedSum = 0;
        if (profile.unearnedIncome && profile.unearnedIncome.items) {
            profile.unearnedIncome.items.forEach(item => {
                const amount = parseFloat(item.amount) || 0;
                if (item.type === 'Monthly') unearnedSum += amount * 12;
                else if (item.type === 'Periodic') unearnedSum += amount * (item.frequency || 1);
                else unearnedSum += amount; // Annual
            });
        }

        // 2. Capacity & Billable Ratio
        // Use shared Utils to ensure exact match with Independent Tool
        const capacity = Utils.calculateBillableCapacity(profile);
        const pBillable = capacity.billableRatio;

        const weeks = parseFloat(profile.schedule?.weeks) || 0;
        const days = parseFloat(profile.schedule?.days) || 0;
        const hours = parseFloat(profile.schedule?.hours) || 0;

        // Safety check: Prevent division by zero
        if (weeks <= 0 || days <= 0 || hours <= 0 || pBillable <= 0) {
            return { now: 0, goal: 0 };
        }

        const totalAnnualHours = weeks * days * hours;

        // 3. Get Gross Income Targets
        // These are expected to be saved by the Independent Tool in profile.goals
        const currentGross = (profile.goals && profile.goals.current) ? profile.goals.current : 0;
        const goalGross = (profile.goals && profile.goals.gross) ? profile.goals.gross : 0;

        // 4. Calculate Hourly Rates
        // Formula: (Gross - Unearned) / Weeks / pBillable / Days / Hours
        // Simplified: (Gross - Unearned) / (TotalHours * pBillable)

        const adjCurrent = Math.max(0, currentGross - unearnedSum);
        const adjGoal = Math.max(0, goalGross - unearnedSum);

        // 5. Precision: Keep full precision for accuracy (User request: "accurate... AS LONG AS evidenced")
        const rateNow = adjCurrent / (totalAnnualHours * pBillable);
        const rateGoal = adjGoal / (totalAnnualHours * pBillable);

        return {
            now: rateNow,
            goal: rateGoal
        };
    },

    /**
     * Calculate Project-Wide Min/Max Wage
     */
    calculateProjectParams: (teamMembers, userMap, minModifierPct = 100, maxModifierPct = 100) => {
        let maxNow = 0;
        let minGoal = Infinity;
        let validGoalFound = false;

        teamMembers.forEach(member => {
            // Member might be just { username, ... } or have overrides.
            // We need their FULL profile from userMap to calc rates
            const user = userMap[member.username];
            const profile = user ? user.independentProfile : null;

            const rates = BudgetEngine.getWorkerRates(profile); // { now, goal }

            if (rates.now > maxNow) maxNow = rates.now;
            if (rates.goal > 0 && rates.goal < minGoal) {
                minGoal = rates.goal;
                validGoalFound = true;
            }
        });

        // Apply Modifiers
        // "minimum wage is a certain percentage of the highest ... NOW rate"
        const projectMin = maxNow * (minModifierPct / 100);

        // "max is a certain percentage of the lowest ... GOAL rate"
        let projectMaxBase = validGoalFound ? minGoal : 0;
        let projectMax = projectMaxBase * (maxModifierPct / 100);

        // Safety: Max shouldn't be less than Min (unless user explicitly pushes it down, but that breaks the 'range' concept)
        // User request says: "as long as this is higher than Min Wage"
        if (projectMax < projectMin) projectMax = projectMin;

        return {
            projectMinWage: projectMin,
            projectMaxWage: projectMax
        };
    },

    /**
     * Calculate Fee for a Line Item
     */
    calculateLineItemFee: (workerGoalRate, projectMin, projectMax) => {
        // Logic:
        // 1. Default to Goal Rate.
        let fee = workerGoalRate;

        // 2. Cap at Project Max
        if (fee > projectMax) fee = projectMax;

        // 3. Floor at Project Min
        if (fee < projectMin) fee = projectMin;

        // 4. EXCEPTION: If original Goal Rate < Project Min, revert to Goal.
        // "No Worker Collaborator would earn an hourly fee that exceeds their GOAL hourly fee"
        if (workerGoalRate < projectMin) {
            fee = workerGoalRate;
        }

        return fee;
    },

    calculateScenario: (phase, projectMin, projectMax, userMap) => {
        // ... Logic for Ideal, Possible, Confirmed ...
        // Returns { cost, income, profit, equityMap }
        // For now stubbed out, will implement fully when building UI structure
        return {};
    },

    calculateEquity: (workerGoalRate, actualPayRate, hours) => {
        const gap = workerGoalRate - actualPayRate;
        if (gap <= 0) {
            return { value: 0, gap: 0 };
        }
        return {
            value: gap * hours,
            gap: gap
        };
    }
};

// Export to window
window.BudgetEngine = BudgetEngine;
