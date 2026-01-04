import BaseCreep from "./baseCreep.js";

/**
 * Worker - Flexible creep type that can perform multiple job types
 * Can handle: build, upgrade, repair, and other general tasks
 * Optimized body: Balanced WORK, CARRY, and MOVE for versatility
 */
export default class Worker extends BaseCreep {
    /**
     * Get worker body composition
     * Strategy: Balanced WORK, CARRY, MOVE (1:1:1 ratio) for flexibility
     * @param {number} energy - Available energy for spawning
     * @returns {string[]} Array of body parts
     */
    static getBody(energy) {
        const parts = [];

        // Minimum worker: 1 WORK, 1 CARRY, 1 MOVE (200 energy)
        if (energy < 200) {
            return [WORK, CARRY, MOVE];
        }

        // Pattern: 1 WORK (100) + 1 CARRY (50) + 1 MOVE (50) = 200 per unit
        const unitCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
        const units = Math.min(16, Math.floor(energy / unitCost)); // Max 16 units = 48 parts

        for (let i = 0; i < units; i++) {
            parts.push(WORK, CARRY, MOVE);
        }

        return parts.length > 0 ? parts : [WORK, CARRY, MOVE];
    }

    /**
     * Get minimum energy for a worker
     * @returns {number}
     */
    static getMinEnergy() {
        return 200; // 1 WORK, 1 CARRY, 1 MOVE
    }

    /**
     * Get ideal energy for a worker
     * @returns {number}
     */
    static getIdealEnergy() {
        return 800; // 4 WORK, 4 CARRY, 4 MOVE
    }

    /**
     * Get job types this creep can perform
     * Workers are flexible and can do many tasks
     * @returns {string[]}
     */
    static getJobTypes() {
        return ['build']; // Can do multiple job types
    }
}
