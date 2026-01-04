import MoveTask from "./moveTask.js";
import Debug from "../../debug/debug.js";

/**
 * Pickup task - Picks up resources from sources, containers, or dropped resources
 */
export default class PickupTask {
    static execute(creep, job) {
        const resourceToPickup = job.resource || RESOURCE_ENERGY;
        const carried = creep.store.getUsedCapacity(resourceToPickup);

        // If full, job is complete
        if (creep.store.getFreeCapacity(resourceToPickup) === 0) {
            creep.say('✅');
            Debug.log(creep.room.name, 'info', `pickup:complete ${creep.name} full`, {
                jobId: job.id,
                amount: carried
            });
            return true;
        }

        // Get target from objectId
        if (job.objectId) {
            const target = Game.getObjectById(job.objectId);

            if (!target) {
                // If we have some cargo, consider job complete
                if (carried > 0) {
                    creep.say('✅');
                    Debug.log(creep.room.name, 'info', `pickup:complete ${creep.name} targetGone`, {
                        jobId: job.id,
                        amount: carried
                    });
                    return true;
                }

                // Check targetPos for dropped resources or harvester transfers
                if (job.targetPos) {
                    const pos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
                    if (creep.room.name === pos.roomName) {
                        // Look for dropped resources
                        const drops = creep.room.lookForAt(LOOK_RESOURCES, pos);
                        if (drops.length > 0) {
                            const result = creep.pickup(drops[0]);
                            if (result === ERR_NOT_IN_RANGE) {
                                MoveTask.execute(creep, job, { range: 1, target: pos });
                                creep.say('🚶');
                            } else if (result === OK) {
                                creep.say('📥');
                            }
                            return false;
                        }

                        // Look for harvesters at this position to receive from
                        const harvesters = pos.findInRange(FIND_MY_CREEPS, 1, {
                            filter: c => c.memory.jobId && String(c.memory.jobId).indexOf('harvest') !== -1
                                && c.store.getUsedCapacity(resourceToPickup) > 0
                        });

                        if (harvesters.length > 0) {
                            // Move to position and wait
                            if (!creep.pos.inRangeTo(pos, 1)) {
                                MoveTask.execute(creep, job, { range: 1, target: pos });
                                creep.say('🚶');
                            } else {
                                creep.say('⏳');
                            }
                            return false;
                        }
                    }
                }

                creep.say('🚫');
                return true;
            }

            // Handle different target types
            if (target instanceof Resource) {
                const result = creep.pickup(target);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveTask.execute(creep, job, { range: 1, target });
                    creep.say('🚶');
                } else if (result === OK) {
                    creep.say('📥');
                }
            } else if (target.store) {
                const result = creep.withdraw(target, resourceToPickup);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveTask.execute(creep, job, { range: 1, target });
                    creep.say('🚶');
                } else if (result === OK) {
                    creep.say('📥');
                } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                    // Not enough - complete with what we have if we have any
                    if (carried > 0) {
                        creep.say('✅');
                        return true;
                    }
                    // Wait at position for more
                    if (!creep.pos.inRangeTo(target, 1)) {
                        MoveTask.execute(creep, job, { range: 1, target });
                        creep.say('🚶');
                    } else {
                        creep.say('⏳');
                    }
                }
            }
        } else if (job.targetPos) {
            // No objectId, use targetPos
            const pos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);

            if (creep.room.name !== pos.roomName) {
                MoveTask.execute(creep, job, { range: 1, target: pos });
                creep.say('🚶');
                return false;
            }

            // Look for resources at position
            const drops = creep.room.lookForAt(LOOK_RESOURCES, pos);
            if (drops.length > 0) {
                const result = creep.pickup(drops[0]);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveTask.execute(creep, job, { range: 1, target: pos });
                    creep.say('🚶');
                } else if (result === OK) {
                    creep.say('📥');
                }
                return false;
            }

            // Check for structures with resources (but never spawns/extensions)
            const structures = creep.room.lookForAt(LOOK_STRUCTURES, pos);
            for (const structure of structures) {
                if (structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION) {
                    continue; // Skip spawns and extensions - they're delivery targets only
                }

                if (structure.store && structure.store.getUsedCapacity(resourceToPickup) > 0) {
                    const result = creep.withdraw(structure, resourceToPickup);
                    if (result === ERR_NOT_IN_RANGE) {
                        MoveTask.execute(creep, job, { range: 1, target: structure });
                        creep.say('🚶');
                    } else if (result === OK) {
                        creep.say('📥');
                    }
                    return false;
                }
            }

            // Check for harvesters nearby
            const harvesters = pos.findInRange(FIND_MY_CREEPS, 1, {
                filter: c => c.memory.jobId && String(c.memory.jobId).indexOf('harvest') !== -1
                    && c.store.getUsedCapacity(resourceToPickup) > 0
            });

            if (harvesters.length > 0) {
                // Wait at position for harvester transfer
                if (!creep.pos.inRangeTo(pos, 1)) {
                    MoveTask.execute(creep, job, { range: 1, target: pos });
                    creep.say('🚶');
                } else {
                    creep.say('⏳');
                }
                return false;
            }

            // Nothing at target position
            if (carried > 0) {
                creep.say('✅');
                return true;
            }
            creep.say('⏳');
        }

        return false;
    }
}
