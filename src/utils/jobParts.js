import Constants from './constants.js';

export default class JobParts {
    static getMissingWantedParts(wantedParts, assignedParts, pendingParts) {
        const missing = Object.create(null);
        if (!wantedParts) return missing;

        for (const partType in wantedParts) {
            const wanted = wantedParts[partType] || 0;
            if (wanted <= 0) continue;

            const assigned = (assignedParts && assignedParts[partType]) ? assignedParts[partType] : 0;
            const pending = (pendingParts && pendingParts[partType]) ? pendingParts[partType] : 0;
            const total = assigned + pending;

            if (total < wanted) {
                missing[partType] = wanted - total;
            }
        }

        return missing;
    }

    static hasAnyUnmetWantedParts(wantedParts, assignedParts, pendingParts) {
        if (!wantedParts) return false;

        for (const partType in wantedParts) {
            const wanted = wantedParts[partType] || 0;
            if (wanted <= 0) continue;

            const assigned = (assignedParts && assignedParts[partType]) ? assignedParts[partType] : 0;
            const pending = (pendingParts && pendingParts[partType]) ? pendingParts[partType] : 0;

            if (assigned + pending < wanted) return true;
        }

        return false;
    }

    /**
     * Scale part counts proportionally to fit within an energy budget.
     * Maintains the ratio between parts while staying within maxEnergy.
     */
    static scalePartsForEnergy(wantedParts, maxEnergy) {
        if (!wantedParts || maxEnergy <= 0) return {};

        const PART_COSTS = {
            WORK: 100,
            CARRY: 50,
            MOVE: 50,
            ATTACK: 80,
            RANGED_ATTACK: 150,
            HEAL: 250,
            CLAIM: 600,
            TOUGH: 10
        };

        // Calculate total cost of wanted parts
        let totalCost = 0;
        for (const partType in wantedParts) {
            const count = wantedParts[partType] || 0;
            const cost = PART_COSTS[partType] || 0;
            totalCost += count * cost;
        }

        if (totalCost <= maxEnergy) {
            // Already fits within budget
            return { ...wantedParts };
        }

        // Scale down proportionally
        const scale = maxEnergy / totalCost;
        const scaled = {};

        for (const partType in wantedParts) {
            const count = wantedParts[partType] || 0;
            scaled[partType] = Math.max(1, Math.floor(count * scale));
        }

        return scaled;
    }

    /**
     * Distribute energy budget into balanced WORK/CARRY/MOVE parts.
     * Returns part counts that fit within the energy budget.
     */
    static distributePartsToEnergy(energy) {
        if (energy < Constants.MIN_SPAWN_ENERGY) return { WORK: 1, CARRY: 1, MOVE: 1 };

        // Try to build balanced 1:1:1 ratio
        const unitCost = Constants.UNIT_COST_WCM; // WORK(100) + CARRY(50) + MOVE(50)
        const units = Math.floor(energy / unitCost);

        return {
            WORK: units,
            CARRY: units,
            MOVE: units
        };
    }
}
