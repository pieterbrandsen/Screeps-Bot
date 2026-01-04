import MoveTask from "./moveTask.js";
import RoomUtils from "../../utils/roomUtils.js";
import TaskUtils from "../../utils/taskUtils.js";

/**
 * Upgrade task - Upgrades the room controller
 */
export default class UpgradeTask {
    /**
     * Execute upgrade task for a creep
     * @param {Creep} creep - The creep performing the upgrade
     * @param {Object} job - The upgrade job object
     * @returns {boolean} True if job is complete, false otherwise (upgrade jobs are persistent)
     */
    static execute(creep, job) {
        const controller = creep.room.controller;
        if (!controller) {
            creep.say('🚫');
            return false;
        }

        const plan = RoomUtils.getControllerContainerPlan(creep.room);
        const container = plan ? plan.container : null;
        const workerSpots = plan ? plan.workerSpots : null;
        const desiredSpot = (container && workerSpots && workerSpots.length > 0)
            ? RoomUtils.pickUpgradeSpotForCreep(creep, workerSpots)
            : null;

        // If empty, pick up energy (prefer controller container if it has energy)
        const needsEnergy = TaskUtils.needsEnergy(creep);
        if (needsEnergy) {
            if (TaskUtils.withdrawFromControllerContainer(creep, container)) {
                creep.say('📥');
                return false;
            }

            // No controller container energy available: do NOT roam for energy.
            // Park in upgrade position and wait for haulers to deliver.
            TaskUtils.moveToWorkPosition(creep, desiredSpot, controller);
            creep.say('⏳');
            return false;
        }

        // With energy: stand on the allocated spot around the controller container
        if (TaskUtils.moveToWorkPosition(creep, desiredSpot, controller)) {
            creep.say('📍');
            return false;
        }

        creep.upgradeController(controller);
        creep.say('⚡');
        return false; // Upgrade jobs are never complete
    }
}
