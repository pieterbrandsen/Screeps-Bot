import BaseCreep from "./baseCreep.js";

/**
 * Hauler - Creep type specialized for transporting resources
 * Optimized body: Maximum CARRY and MOVE parts (1:1 ratio for roads, 2:1 for plains)
 */
export default class Hauler extends BaseCreep {
    /**
     * Get hauler body composition
     * Strategy: Equal CARRY and MOVE for speed on roads (1:1 ratio)
     * @param {number} energy - Available energy for spawning
     * @returns {string[]} Array of body parts
     */
    static getBody(energy) {
        const parts = [];

        // Minimum hauler: 1 CARRY, 1 MOVE (100 energy)
        if (energy < 100) {
            return [CARRY, MOVE];
        }

        // Pattern: 1 CARRY (50) + 1 MOVE (50) = 100 per unit
        const unitCost = BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
        const units = Math.min(25, Math.floor(energy / unitCost)); // Max 25 units = 50 parts

        for (let i = 0; i < units; i++) {
            parts.push(CARRY);
        }
        for (let i = 0; i < units; i++) {
            parts.push(MOVE);
        }

        return parts.length > 0 ? parts : [CARRY, MOVE];
    }

    /**
     * Get job types this creep can perform
     * @returns {string[]}
     */
    static getJobTypes() {
        return ['pickup', 'delivery'];
    }
}
