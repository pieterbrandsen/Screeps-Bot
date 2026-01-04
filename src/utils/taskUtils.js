import MoveManager from "../hivemind/moveManager.js";

/**
 * Task Utilities - Common helper functions for task execution
 */
export default class TaskUtils {
    /**
     * Find energy sources in a room (containers, storage - NOT spawns/extensions)
     * @param {Room} room - The room to search in
     * @returns {Structure[]} Array of structures with available energy
     */
    static findEnergySources(room) {
        return room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_CONTAINER ||
                s.structureType === STRUCTURE_STORAGE)
                && s.store && s.store[RESOURCE_ENERGY] > 0
        });
    }

    /**
     * Attempt to withdraw energy from available sources
     * Returns true if the creep is withdrawing or moving to withdraw
     * @param {Creep} creep - The creep that needs energy
     * @returns {boolean} True if attempting to withdraw, false if no sources available
     */
    static withdrawEnergyFromSources(creep) {
        const sources = this.findEnergySources(creep.room);

        if (sources.length > 0) {
            const target = creep.pos.findClosestByPath(sources);
            if (target) {
                const result = creep.withdraw(target, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveManager.moveTo(creep, target, { range: 1 });
                }
                return true;
            }
        }

        return false;
    }

    /**
     * Attempt to withdraw energy from controller container
     * @param {Creep} creep - The creep that needs energy
     * @param {Structure} container - The controller container
     * @returns {boolean} True if withdrawing or moving, false if not possible
     */
    static withdrawFromControllerContainer(creep, container) {
        if (!container || !container.store || container.store[RESOURCE_ENERGY] <= 0) {
            return false;
        }

        const result = creep.withdraw(container, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
            MoveManager.moveTo(creep, container, { range: 1 });
        }

        return true;
    }

    /**
     * Move creep to desired position or controller range
     * Used by upgrade and build tasks
     * @param {Creep} creep - The creep to move
     * @param {RoomPosition|null} desiredSpot - The preferred position
     * @param {StructureController} controller - The controller to stay near
     */
    static moveToWorkPosition(creep, desiredSpot, controller) {
        if (desiredSpot) {
            if (creep.pos.x !== desiredSpot.x || creep.pos.y !== desiredSpot.y) {
                MoveManager.moveTo(creep, desiredSpot, { range: 0 });
                return true;
            }
        } else if (controller && creep.pos.getRangeTo(controller) > 3) {
            MoveManager.moveTo(creep, controller, { range: 3 });
            return true;
        }
        return false;
    }

    /**
     * Check if creep needs energy (empty store)
     * @param {Creep} creep - The creep to check
     * @returns {boolean} True if creep needs energy
     */
    static needsEnergy(creep) {
        return creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
    }

    /**
     * Check if creep has energy
     * @param {Creep} creep - The creep to check
     * @returns {boolean} True if creep has energy
     */
    static hasEnergy(creep) {
        return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
    }
}
