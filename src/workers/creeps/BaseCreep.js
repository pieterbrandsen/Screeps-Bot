import MoveManager from "../../hivemind/moveManager.js";
import TaskUtils from "../../utils/taskUtils.js";
import RoomUtils from "../../utils/roomUtils.js";

/**
 * BaseCreep - Base class for all creep types
 * Handles body composition calculation and spawning configuration
 */
export default class BaseCreep {
    /**
     * Get the body parts pattern for this creep type
     * @param {number} energy - Available energy for spawning
     * @returns {string[]} Array of body part constants
     */
    static getBody(energy) {
        // Default balanced body: WORK, CARRY, MOVE
        const parts = [];
        const unitCost = BODYPART_COST[WORK] + BODYPART_COST[CARRY] + BODYPART_COST[MOVE];
        const units = Math.floor(energy / unitCost);

        for (let i = 0; i < units && parts.length < 50; i++) {
            parts.push(WORK, CARRY, MOVE);
        }

        return parts.length > 0 ? parts : [WORK, CARRY, MOVE];
    }

    /**
     * Get the job types this creep can perform
     * @returns {string[]} Array of job type strings
     */
    static getJobTypes() {
        return ['build', 'upgrade']; // Default can do building/upgrading
    }
}
