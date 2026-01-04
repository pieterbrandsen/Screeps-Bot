import MoveManager from "../../hivemind/moveManager.js";

/**
 * Move task - Handles movement to a target location
 * This is a reusable task that can be part of multi-task jobs
 */
export default class MoveTask {
    /**
     * Execute move task for a creep
     * @param {Creep} creep - The creep performing the move
     * @param {Object} job - The job object containing movement target
     * @param {Object} options - Movement options
     * @param {number} options.range - Desired range to target (default: 1)
     * @param {RoomPosition|Object|string} options.target - Target to move to (can be pos, object, or objectId)
     * @returns {boolean} True if at target, false if still moving
     */
    static execute(creep, job, options = {}) {
        const range = options.range !== undefined ? options.range : 1;
        let target = options.target;

        // If no target in options, try to determine from job
        if (!target) {
            if (job.objectId) {
                target = Game.getObjectById(job.objectId);
            } else if (job.targetPos) {
                target = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
            }
        }

        // Handle string objectId
        if (typeof target === 'string') {
            target = Game.getObjectById(target);
        }

        if (!target) {
            creep.say('❓');
            return true; // No target means we're "done" moving
        }

        // Check if already at target range
        if (creep.pos.inRangeTo(target, range)) {
            return true; // Arrived at target
        }

        // Move toward target
        const moveResult = MoveManager.moveTo(creep, target, { range });

        if (moveResult === OK || moveResult === ERR_TIRED) {
            creep.say('🚶');
        } else if (moveResult === ERR_NO_PATH) {
            creep.say('🚫');
        }

        return false; // Still moving
    }

    /**
     * Check if creep is at target range without moving
     * @param {Creep} creep - The creep to check
     * @param {Object} job - The job object
     * @param {Object} options - Movement options (same as execute)
     * @returns {boolean} True if at target range
     */
    static isAtTarget(creep, job, options = {}) {
        const range = options.range !== undefined ? options.range : 1;
        let target = options.target;

        if (!target) {
            if (job.objectId) {
                target = Game.getObjectById(job.objectId);
            } else if (job.targetPos) {
                target = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
            }
        }

        if (typeof target === 'string') {
            target = Game.getObjectById(target);
        }

        if (!target) {
            return false;
        }

        return creep.pos.inRangeTo(target, range);
    }
}
