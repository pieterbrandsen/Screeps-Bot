import BaseCreep from "./baseCreep.js";

/**
 * Upgrader - Creep type specialized for upgrading controller
 * Optimized body: More WORK parts for faster upgrading, minimal CARRY, balanced MOVE
 */
export default class Upgrader extends BaseCreep {
    /**
     * Get upgrader body composition
     * Strategy: 3 WORK for upgrading speed, 1 CARRY for energy transport, 2 MOVE for mobility
     * @param {number} energy - Available energy for spawning
     * @returns {string[]} Array of body parts
     */
    static getBody(energy) {
        const parts = [];

        // Minimum upgrader: 1 WORK, 1 CARRY, 1 MOVE (200 energy)
        if (energy < 200) {
            return [WORK, CARRY, MOVE];
        }

        // Pattern: 3 WORK (300) + 1 CARRY (50) + 2 MOVE (100) = 450 per unit
        let remainingEnergy = energy;
        let workParts = 0;
        let carryParts = 0;
        let moveParts = 0;

        while (remainingEnergy >= 450 && parts.length + 6 <= 50) {
            workParts += 3;
            carryParts += 1;
            moveParts += 2;
            remainingEnergy -= 450;
        }

        // Add remaining energy as balanced parts
        while (remainingEnergy >= 200 && parts.length + 3 <= 50) {
            workParts += 1;
            carryParts += 1;
            moveParts += 1;
            remainingEnergy -= 200;
        }

        // Build body: WORK parts first, then CARRY, then MOVE
        for (let i = 0; i < workParts; i++) {
            parts.push(WORK);
        }
        for (let i = 0; i < carryParts; i++) {
            parts.push(CARRY);
        }
        for (let i = 0; i < moveParts; i++) {
            parts.push(MOVE);
        }

        return parts.length > 0 ? parts : [WORK, CARRY, MOVE];
    }

    /**
     * Get job types this creep can perform
     * @returns {string[]}
     */
    static getJobTypes() {
        return ['upgrade'];
    }
}
