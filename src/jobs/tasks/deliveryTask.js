import MoveTask from "./moveTask.js";
import Debug from "../../debug/debug.js";

/**
 * Delivery task - Delivers carried resources to spawns, extensions, towers, containers, or storage
 */
export default class DeliveryTask {
    static execute(creep, job) {
        const resourceToDeliver = job.resource || RESOURCE_ENERGY;
        const carried = creep.store.getUsedCapacity(resourceToDeliver);

        // If empty, job is complete
        if (carried === 0) {
            creep.say('✅');
            Debug.log(creep.room.name, 'info', `delivery:complete ${creep.name} empty`, { jobId: job.id });
            return true;
        }

        // Determine delivery targets based on job deliveryTarget type
        const deliveryTarget = job.deliveryTarget || 'spawn-core';

        if (deliveryTarget === 'spawn-core') {
            // Priority: Spawns, Extensions, Towers
            const targets = creep.room.find(FIND_STRUCTURES, {
                filter: s => (s.structureType === STRUCTURE_SPAWN ||
                    s.structureType === STRUCTURE_EXTENSION ||
                    s.structureType === STRUCTURE_TOWER)
                    && s.store && s.store.getFreeCapacity(resourceToDeliver) > 0
            });

            if (targets.length > 0) {
                // Prioritize spawns first, then extensions, then towers
                targets.sort((a, b) => {
                    const aPriority = a.structureType === STRUCTURE_SPAWN ? 0 :
                        a.structureType === STRUCTURE_EXTENSION ? 1 : 2;
                    const bPriority = b.structureType === STRUCTURE_SPAWN ? 0 :
                        b.structureType === STRUCTURE_EXTENSION ? 1 : 2;
                    if (aPriority !== bPriority) return aPriority - bPriority;
                    return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
                });

                const target = targets[0];
                const result = creep.transfer(target, resourceToDeliver);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveTask.execute(creep, job, { range: 1, target });
                    creep.say('🚚');
                } else if (result === OK) {
                    creep.say('🚚');
                } else if (result === ERR_FULL) {
                    // Try next target
                    if (targets.length > 1) {
                        const nextTarget = targets[1];
                        const nextResult = creep.transfer(nextTarget, resourceToDeliver);
                        if (nextResult === ERR_NOT_IN_RANGE) {
                            MoveTask.execute(creep, job, { range: 1, target: nextTarget });
                            creep.say('🚚');
                        } else if (nextResult === OK) {
                            creep.say('🚚');
                        }
                    }
                }
                return false;
            }

            // All spawn-core targets full, job complete
            creep.say('✅');
            Debug.log(creep.room.name, 'info', `delivery:complete ${creep.name} allFull`, { jobId: job.id });
            return true;

        } else if (deliveryTarget === 'controller-area') {
            // Controller container or upgraders
            if (resourceToDeliver === RESOURCE_ENERGY && creep.room.controller) {
                const controllerContainer = creep.room.controller.pos.findInRange(FIND_STRUCTURES, 2, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER
                        && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                })[0];

                if (controllerContainer) {
                    const result = creep.transfer(controllerContainer, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) {
                        MoveTask.execute(creep, job, { range: 1, target: controllerContainer });
                        creep.say('🚚');
                    } else if (result === OK) {
                        creep.say('🚚');
                    }
                    return false;
                }

                // No container, find upgraders
                const upgraders = creep.room.find(FIND_MY_CREEPS, {
                    filter: c => c.name !== creep.name
                        && c.store && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        && c.memory && c.memory.jobId
                        && String(c.memory.jobId).indexOf('upgrade') !== -1
                });

                if (upgraders.length > 0) {
                    upgraders.sort((a, b) => creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos));
                    const target = upgraders[0];
                    const result = creep.transfer(target, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) {
                        MoveTask.execute(creep, job, { range: 1, target });
                        creep.say('🚚');
                    } else if (result === OK) {
                        creep.say('🚚');
                    }
                    return false;
                }
            }

            // No controller targets, complete
            creep.say('✅');
            return true;

        } else if (deliveryTarget === 'workers') {
            // Find workers that need energy
            const workers = creep.room.find(FIND_MY_CREEPS, {
                filter: c => c.name !== creep.name
                    && c.store && c.store.getFreeCapacity(resourceToDeliver) > 0
                    && c.memory && c.memory.jobId
                    && (String(c.memory.jobId).indexOf('upgrade') !== -1
                        || String(c.memory.jobId).indexOf('build') !== -1)
            });

            if (workers.length > 0) {
                workers.sort((a, b) => {
                    // Prioritize workers with less energy
                    const aEnergy = a.store.getUsedCapacity(RESOURCE_ENERGY);
                    const bEnergy = b.store.getUsedCapacity(RESOURCE_ENERGY);
                    if (aEnergy !== bEnergy) return aEnergy - bEnergy;
                    return creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos);
                });

                const target = workers[0];
                const result = creep.transfer(target, resourceToDeliver);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveTask.execute(creep, job, { range: 1, target });
                    creep.say('🚚');
                } else if (result === OK) {
                    creep.say('🚚');
                }
                return false;
            }

            // No workers need energy
            creep.say('✅');
            return true;

        } else if (deliveryTarget === 'storage') {
            // Storage or containers
            if (creep.room.storage && creep.room.storage.store.getFreeCapacity(resourceToDeliver) > 0) {
                const result = creep.transfer(creep.room.storage, resourceToDeliver);
                if (result === ERR_NOT_IN_RANGE) {
                    MoveTask.execute(creep, job, { range: 1, target: creep.room.storage });
                    creep.say('🚚');
                } else if (result === OK) {
                    creep.say('🚚');
                }
                return false;
            }

            // Find any container with space
            const containers = creep.room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
                    && s.store && s.store.getFreeCapacity(resourceToDeliver) > 0
            });

            if (containers.length > 0) {
                const target = creep.pos.findClosestByRange(containers);
                if (target) {
                    const result = creep.transfer(target, resourceToDeliver);
                    if (result === ERR_NOT_IN_RANGE) {
                        MoveTask.execute(creep, job, { range: 1, target });
                        creep.say('🚚');
                    } else if (result === OK) {
                        creep.say('🚚');
                    }
                    return false;
                }
            }

            // No storage available, idle with cargo
            creep.say('💤');
            return false;
        }

        // Unknown delivery target type
        creep.say('❓');
        Debug.log(creep.room.name, 'warn', `delivery:unknownTarget ${creep.name}`, {
            jobId: job.id,
            deliveryTarget: deliveryTarget
        });
        return true;
    }
}
