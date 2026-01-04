import MoveTask from "./moveTask.js";
import JobsManager from "../jobsManager.js";
import Debug from "../../debug/debug.js";

/**
 * Haul task - Picks up resources and delivers them to spawns/extensions/containers
 */
export default class HaulTask {
    /**
     * Execute haul task for a creep
     * @param {Creep} creep - The creep performing the haul
     * @param {Object} job - The haul job object
     * @returns {boolean} True if job is complete, false otherwise
     */
    static execute(creep, job) {
        const jobRoom = creep.memory.jobRoom || job.startRoom || creep.room.name;

        const moveTo = (target, opts) => {
            const targetForMove = target && target.pos ? target.pos : target;
            MoveTask.execute(creep, job, { range: (opts && opts.range) || 1, target: targetForMove });
        };

        // Check if we have the target in memory
        if (!creep.memory.haulState) {
            const carried = creep.store.getUsedCapacity(job.resource || RESOURCE_ENERGY);
            creep.memory.haulState = carried > 0 ? 'deliver' : 'pickup';
        }

        // Pickup phase
        if (creep.memory.haulState === 'pickup') {
            return this._doPickup(creep, job, jobRoom, moveTo);
        }

        // Delivery phase
        if (creep.memory.haulState === 'deliver') {
            return this._doDeliver(creep, job, jobRoom, moveTo);
        }

        return false;
    }

    static _doPickup(creep, job, jobRoom, moveTo) {
        const resourceToHaul = job.resource || RESOURCE_ENERGY;

        // Keep reservations accurate for container-based jobs (and clear stale reservations).
        try {
            const availableAmount = (function () { const totalReserved = job.totalReserved || 0; return Math.max(0, job.amount - totalReserved); })();
            const desiredReserve = Math.min(creep.store.getFreeCapacity(resourceToHaul), availableAmount);
            const prev = creep.memory.haulReservedAmount || 0;
            if (desiredReserve !== prev || (Game.time % 5) === 0) {
                if (desiredReserve > 0 || prev > 0) {
                    (function (amount) { if (amount === 0) { if (job.reservations && job.reservations[creep.name]) { job.totalReserved = Math.max(0, (job.totalReserved || 0) - job.reservations[creep.name]); delete job.reservations[creep.name]; } } else { if (!job.reservations) job.reservations = {}; const prev = job.reservations[creep.name] || 0; job.reservations[creep.name] = amount; job.totalReserved = (job.totalReserved || 0) - prev + amount; } })(desiredReserve);
                    creep.memory.haulReservedAmount = desiredReserve;
                }
            }
        } catch (e) {
            // ignore reservation issues
        }

        if (creep.store.getFreeCapacity(resourceToHaul) === 0) {
            // Full, switch to delivery
            creep.memory.haulState = 'deliver';
            Debug.log(creep.room.name, 'debug', `haul:state ${creep.name} pickup->deliver (full)`, {
                jobId: job.id,
                used: creep.store.getUsedCapacity(resourceToHaul)
            });
            return false;
        }

        // Try to pickup from job target
        if (job.objectId) {
            const target = Game.getObjectById(job.objectId);

            if (!target) {
                // Target doesn't exist anymore.
                if (job.resourceType === 'source' && job.targetPos) {
                    creep.memory.haulState = 'pickup';
                    try {
                        (function (amount) { if (amount === 0) { if (job.reservations && job.reservations[creep.name]) { job.totalReserved = Math.max(0, (job.totalReserved || 0) - job.reservations[creep.name]); delete job.reservations[creep.name]; } } else { if (!job.reservations) job.reservations = {}; const prev = job.reservations[creep.name] || 0; job.reservations[creep.name] = amount; job.totalReserved = (job.totalReserved || 0) - prev + amount; } })(0);
                        creep.memory.haulReservedAmount = 0;
                    } catch (e) {
                        // ignore
                    }
                    const fallbackPos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
                    if (!creep.pos.inRangeTo(fallbackPos, 1)) {
                        moveTo(fallbackPos, { range: 1 });
                        creep.say('⏳');
                    } else {
                        creep.say('⌛');
                    }
                    return false;
                }

                creep.memory.haulState = null;
                Debug.log(creep.room.name, 'info', `haul:complete ${creep.name} targetMissing`, { jobId: job.id });
                return true;
            }

            let result;
            if (job.resourceType === 'dropped') {
                result = creep.pickup(target);
            } else {
                result = creep.withdraw(target, resourceToHaul);
            }

            if (result === ERR_NOT_IN_RANGE) {
                moveTo(target, { range: 1 });
                creep.say('📦');
            } else if (result === OK) {
                // Successfully picked up, switch to deliver
                creep.memory.haulState = 'deliver';
                creep.say('📦✔');

                // Clear reservation
                try {
                    (function (amount) { if (amount === 0) { if (job.reservations && job.reservations[creep.name]) { job.totalReserved = Math.max(0, (job.totalReserved || 0) - job.reservations[creep.name]); delete job.reservations[creep.name]; } } else { if (!job.reservations) job.reservations = {}; const prev = job.reservations[creep.name] || 0; job.reservations[creep.name] = amount; job.totalReserved = (job.totalReserved || 0) - prev + amount; } })(0);
                    creep.memory.haulReservedAmount = 0;
                } catch (e) {
                    // ignore
                }

                Debug.log(creep.room.name, 'debug', `haul:state ${creep.name} pickup->deliver (picked)`, {
                    jobId: job.id,
                    got: creep.store.getUsedCapacity(resourceToHaul)
                });
            } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                // Target is empty
                try {
                    (function (amount) { if (amount === 0) { if (job.reservations && job.reservations[creep.name]) { job.totalReserved = Math.max(0, (job.totalReserved || 0) - job.reservations[creep.name]); delete job.reservations[creep.name]; } } else { if (!job.reservations) job.reservations = {}; const prev = job.reservations[creep.name] || 0; job.reservations[creep.name] = amount; job.totalReserved = (job.totalReserved || 0) - prev + amount; } })(0);
                    creep.memory.haulReservedAmount = 0;
                } catch (e) {
                    // ignore
                }

                if (job.resourceType === 'source') {
                    if (!creep.pos.inRangeTo(target.pos, 1)) {
                        moveTo(target, { range: 1 });
                        creep.say('⏳');
                    } else {
                        creep.say('⌛');
                    }
                    return false;
                }

                creep.memory.haulState = null;
                Debug.log(creep.room.name, 'info', `haul:complete ${creep.name} empty`, { jobId: job.id });
                return true;
            }
        } else if (job.targetPos) {
            return this._doPositionBasedPickup(creep, job, jobRoom, resourceToHaul, moveTo);
        } else {
            // No valid target, job complete
            creep.memory.haulState = null;
            Debug.log(creep.room.name, 'warn', `haul:complete ${creep.name} invalidTarget`, { jobId: job.id });
            return true;
        }

        return false;
    }

    static _doPositionBasedPickup(creep, job, jobRoom, resourceToHaul, moveTo) {
        const targetPos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
        const carried = creep.store.getUsedCapacity(resourceToHaul);

        // If there is a nearby container with energy, withdraw from it
        if (resourceToHaul === RESOURCE_ENERGY && creep.room.name === targetPos.roomName) {
            const nearbyContainer = creep.room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
                    && s.store
                    && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
                    && s.pos.getRangeTo(targetPos) <= 1
            });

            if (nearbyContainer.length > 0) {
                nearbyContainer.sort((a, b) => creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos));
                const c = nearbyContainer[0];
                const result = creep.withdraw(c, RESOURCE_ENERGY);
                if (result === ERR_NOT_IN_RANGE) {
                    moveTo(c, { range: 1 });
                    creep.say('📦');
                    return false;
                }
                if (result === OK) {
                    creep.memory.haulState = 'deliver';
                    creep.say('📦✔');

                    try {
                        (function (amount) { if (amount === 0) { if (job.reservations && job.reservations[creep.name]) { job.totalReserved = Math.max(0, (job.totalReserved || 0) - job.reservations[creep.name]); delete job.reservations[creep.name]; } } else { if (!job.reservations) job.reservations = {}; const prev = job.reservations[creep.name] || 0; job.reservations[creep.name] = amount; job.totalReserved = (job.totalReserved || 0) - prev + amount; } })(0);
                        creep.memory.haulReservedAmount = 0;
                    } catch (e) {
                        // ignore
                    }
                    return false;
                }
            }
        }

        // Look for dropped resources near the target position
        const nearbyDrops = creep.room.find(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === resourceToHaul && r.pos.getRangeTo(targetPos) <= 2
        });

        if (nearbyDrops.length > 0) {
            nearbyDrops.sort((a, b) => creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos));
            const drop = nearbyDrops[0];

            const result = creep.pickup(drop);
            if (result === ERR_NOT_IN_RANGE) {
                moveTo(drop.pos, { range: 1 });
                creep.say('📦');
            } else if (result === OK) {
                creep.memory.haulState = 'deliver';
                creep.say('📦✔');

                try {
                    (function (amount) { if (amount === 0) { if (job.reservations && job.reservations[creep.name]) { job.totalReserved = Math.max(0, (job.totalReserved || 0) - job.reservations[creep.name]); delete job.reservations[creep.name]; } } else { if (!job.reservations) job.reservations = {}; const prev = job.reservations[creep.name] || 0; job.reservations[creep.name] = amount; job.totalReserved = (job.totalReserved || 0) - prev + amount; } })(0);
                    creep.memory.haulReservedAmount = 0;
                } catch (e) {
                    // ignore
                }

                Debug.log(creep.room.name, 'debug', `haul:state ${creep.name} pickup->deliver (pickedNearPos)`, {
                    jobId: job.id,
                    got: creep.store.getUsedCapacity(resourceToHaul)
                });
            }
        } else {
            // If we already have some cargo, don't idle here forever
            if (carried > 0) {
                creep.memory.haulState = 'deliver';
                creep.say('🚚');
                return false;
            }

            // Move to position and wait for energy
            if (!creep.pos.inRangeTo(targetPos, 1)) {
                moveTo(targetPos, { range: 1 });
                creep.say('⏳');
            } else {
                creep.say('⌛');
            }
        }

        return false;
    }

    static _doDeliver(creep, job, jobRoom, moveTo) {
        const resourceToHaul = job.resource || RESOURCE_ENERGY;

        if (creep.store.getUsedCapacity(resourceToHaul) === 0) {
            // Empty: dropped-resource jobs can complete; persistent jobs should loop
            if (job.resourceType === 'dropped') {
                creep.memory.haulState = null;
                Debug.log(creep.room.name, 'info', `haul:complete ${creep.name} deliveredAll`, { jobId: job.id });
                return true;
            }

            creep.memory.haulState = 'pickup';
            creep.say('🔄');
            return false;
        }

        // Find nearest spawn or extension that needs this resource
        const targets = creep.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_EXTENSION ||
                s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_TOWER)
                && s.store && s.store.getFreeCapacity(resourceToHaul) > 0
        });

        if (targets.length > 0) {
            let ordered = null;
            const byPath = creep.pos.findClosestByPath(targets);
            if (byPath) {
                ordered = [byPath, ...targets.filter(t => t.id !== byPath.id)];
            } else {
                ordered = [...targets].sort((a, b) => creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos));
            }

            for (const target of ordered) {
                const result = creep.transfer(target, resourceToHaul);
                if (result === OK) {
                    creep.say('🚚');
                    break;
                }
                if (result === ERR_NOT_IN_RANGE) {
                    moveTo(target, { range: 1 });
                    creep.say('🚚');
                    break;
                }

                if (result === ERR_FULL) {
                    continue;
                }
            }
        } else {
            return this._deliverToSecondaryTargets(creep, job, resourceToHaul, moveTo);
        }

        return false;
    }

    static _deliverToSecondaryTargets(creep, job, resourceToHaul, moveTo) {
        // No spawns/extensions/towers need this resource.
        // Prefer (1) filling controller container, (2) transferring to workers (upgraders/builders),
        // then fall back to (3) storage/any container.

        let delivered = false;

        if (resourceToHaul === RESOURCE_ENERGY && creep.room.controller) {
            const controller = creep.room.controller;

            const controllerContainer = controller.pos.findInRange(FIND_STRUCTURES, 2, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
                    && s.store
                    && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            })[0];

            if (controllerContainer) {
                const result = creep.transfer(controllerContainer, RESOURCE_ENERGY);
                if (result === OK) {
                    delivered = true;
                    creep.say('🚚');
                } else if (result === ERR_NOT_IN_RANGE) {
                    moveTo(controllerContainer, { range: 1 });
                    delivered = true;
                    creep.say('🚚');
                } else if (result === ERR_FULL) {
                    delivered = false;
                }
            } else {
                // Find workers (upgraders and builders) that need energy
                const workerTargets = creep.room.find(FIND_MY_CREEPS, {
                    filter: c => c
                        && c.store
                        && c.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        && c.memory
                        && c.memory.jobId
                        && (String(c.memory.jobId).indexOf('upgrade') !== -1
                            || String(c.memory.jobId).indexOf('build') !== -1)
                });

                if (workerTargets.length > 0) {
                    workerTargets.sort((a, b) => creep.pos.getRangeTo(a.pos) - creep.pos.getRangeTo(b.pos));
                    const target = workerTargets[0];
                    const result = creep.transfer(target, RESOURCE_ENERGY);
                    if (result === OK) {
                        delivered = true;
                        creep.say('🚚');
                    } else if (result === ERR_NOT_IN_RANGE) {
                        moveTo(target, { range: 1 });
                        delivered = true;
                        creep.say('🚚');
                    } else if (result === ERR_FULL) {
                        delivered = false;
                    }
                }
            }
        }

        if (!delivered) {
            // Fall back to storage or any container WITH free capacity
            const storage = (creep.room.storage && creep.room.storage.store.getFreeCapacity(resourceToHaul) > 0)
                ? creep.room.storage
                : null;

            const containers = creep.room.find(FIND_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
                    && s.store
                    && s.store.getFreeCapacity(resourceToHaul) > 0
            });

            const sink = storage || (containers.length > 0 ? containers[0] : null);

            if (sink) {
                const result = creep.transfer(sink, resourceToHaul);
                if (result === ERR_NOT_IN_RANGE) {
                    moveTo(sink, { range: 1 });
                    creep.say('🚚');
                } else if (result === OK) {
                    creep.say('🚚');
                }
            } else {
                // Nowhere to deliver
                creep.drop(resourceToHaul);
                creep.memory.haulState = null;
                Debug.log(creep.room.name, 'warn', `haul:complete ${creep.name} droppedNoTarget`, { jobId: job.id });
                return true;
            }
        }

        return false;
    }
}

