import MoveTask from "./moveTask.js";

/**
 * Harvest task - Mines resources from sources and transfers to containers/haulers
 */
export default class HarvestTask {
    /**
     * Execute harvest task for a creep
     * @param {Creep} creep - The creep performing the harvest
     * @param {Object} job - The harvest job object
     * @returns {boolean} True if job is complete, false otherwise (harvest jobs are persistent)
     */
    static execute(creep, job) {
        const source = Game.getObjectById(job.objectId);

        if (!source) {
            creep.say('🚫');
            return false;
        }

        const harvestResult = creep.harvest(source);

        if (harvestResult === ERR_NOT_IN_RANGE) {
            MoveTask.execute(creep, job, { range: 1 });
            return false;
        }

        // Harvester is now at source - stay here and harvest
        if (harvestResult === OK) {
            creep.say('⛏️');
        }

        // If creep is carrying energy, prefer handing off to adjacent container/hauler.
        const carried = creep.store.getUsedCapacity(RESOURCE_ENERGY);
        if (carried > 0) {
            const nearbyContainer = creep.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            });

            if (nearbyContainer.length > 0) {
                creep.transfer(nearbyContainer[0], RESOURCE_ENERGY);
                creep.say('📥');
            } else {
                const nearbyHaulers = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
                    filter: c => c !== creep
                        && c.memory
                        && c.memory.jobId
                        && String(c.memory.jobId).indexOf('haul') !== -1
                        && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                });

                if (nearbyHaulers.length > 0) {
                    nearbyHaulers.sort((a, b) => b.store.getFreeCapacity(RESOURCE_ENERGY) - a.store.getFreeCapacity(RESOURCE_ENERGY));
                    creep.transfer(nearbyHaulers[0], RESOURCE_ENERGY);
                    creep.say('🔄');
                }
            }
        }

        return false; // Harvest jobs are never complete
    }
}
