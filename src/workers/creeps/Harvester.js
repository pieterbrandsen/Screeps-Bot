import BaseCreep from "./baseCreep.js";

/**
 * Harvester - Creep type specialized for harvesting resources
 * Optimized body: Maximum WORK parts for mining, minimal CARRY, balanced MOVE
 */
export default class Harvester extends BaseCreep {
    /**
     * Get harvester body composition
     * Strategy: 5 WORK (mines 10 energy/tick), 1 CARRY (hold energy briefly), 3 MOVE (50% speed on roads)
     * @param {number} energy - Available energy for spawning
     * @returns {string[]} Array of body parts
     */
    static getBody(energy) {
        const parts = [];

        // Minimum harvester: 2 WORK, 1 CARRY, 1 MOVE (300 energy)
        if (energy < 300) {
            return [WORK, CARRY, MOVE];
        }

        // Calculate how many WORK parts we can afford
        // Pattern: 2 WORK (200) + 1 CARRY (50) + 1 MOVE (50) = 300 per unit
        let remainingEnergy = energy;
        let workParts = 0;
        let moveParts = 0;

        // Add WORK parts (max 6 for standard source, 5 typically)
        while (workParts < 6 && remainingEnergy >= BODYPART_COST[WORK] + BODYPART_COST[MOVE]) {
            workParts += 2;
            moveParts += 1;
            remainingEnergy -= (BODYPART_COST[WORK] * 2 + BODYPART_COST[MOVE]);

            if (parts.length + 3 > 50) break;
        }

        // Add 1 CARRY for holding energy
        if (parts.length + workParts + moveParts + 1 <= 50) {
            // Build body: WORK parts first, then CARRY, then MOVE (for spawn efficiency)
            for (let i = 0; i < workParts; i++) {
                parts.push(WORK);
            }
            parts.push(CARRY);
            for (let i = 0; i < moveParts; i++) {
                parts.push(MOVE);
            }
        }

        return parts.length > 0 ? parts : [WORK, WORK, CARRY, MOVE];
    }

    /**
     * Get job types this creep can perform
     * @returns {string[]}
     */
    static getJobTypes() {
        return ['harvest'];
    }
}
