import Debug from '../debug/debug.js';
import RoomTravel from '../rooms/roomTravel.js';
import CreepBody from '../utils/creepBody.js';
import JobParts from '../utils/jobParts.js';

/**
 * Static utility class for job-related operations.
 * For room-specific job operations, use JobsRoomPartHandler instead.
 */
export default class JobsManager {
    static normalizePartCounts(parts) {
        const out = {};
        if (!parts) return out;

        for (const k in parts) {
            const v = parts[k];
            if (!v) continue;
            const key = String(k).toUpperCase();
            out[key] = (out[key] || 0) + v;
        }

        return out;
    }

    static normalizeWantedPartsInPlace(job) {
        if (!job || !job.wantedCreepParts) return;

        let needs = false;
        for (const k in job.wantedCreepParts) {
            if (String(k) !== String(k).toUpperCase()) {
                needs = true;
                break;
            }
        }

        if (needs) {
            job.wantedCreepParts = JobsManager.normalizePartCounts(job.wantedCreepParts);
        }
    }

    static getCreepDeathTick(creep) {
        if (!creep) return Game.time;
        const ttl = creep.ticksToLive;
        if (ttl === undefined || ttl === null) return Game.time;
        return Game.time + ttl;
    }

    static getPartCountsFromBody(body) {
        const counts = {};
        if (!body) return counts;

        for (const part of body) {
            const key = String(part).toUpperCase();
            counts[key] = (counts[key] || 0) + 1;
        }
        return counts;
    }

    static buildBodyWithBaseFirst(requiredCounts, maxEnergy, baseCounts) {
        const baseFirstPlan = CreepBody.buildBodyFromCounts(baseCounts, maxEnergy, {
            order: ['WORK', 'CARRY', 'MOVE', 'TOUGH', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM']
        });

        const remaining = Object.create(null);
        for (const pt in requiredCounts) {
            remaining[pt] = Math.max(0, (requiredCounts[pt] || 0) - (baseFirstPlan.usedCounts[pt] || 0));
        }

        const restPlan = CreepBody.buildBodyFromCounts(remaining, maxEnergy - baseFirstPlan.cost, {
            order: ['MOVE', 'CARRY', 'WORK', 'TOUGH', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM']
        });

        // Merge usedCounts properly by adding, not overwriting
        const mergedCounts = { ...baseFirstPlan.usedCounts };
        for (const pt in restPlan.usedCounts) {
            mergedCounts[pt] = (mergedCounts[pt] || 0) + (restPlan.usedCounts[pt] || 0);
        }

        return {
            body: [...baseFirstPlan.body, ...restPlan.body],
            cost: baseFirstPlan.cost + restPlan.cost,
            usedCounts: mergedCounts
        };
    }

    static calculateEffectivePriority(room, job) {
        const jobs = (Memory.jobs[room.name] || []).map(j => {
            JobsManager.normalizeWantedPartsInPlace(j);
            return j;
        });
        const harvestJobs = jobs.filter(j => j.type === 'harvest');
        const haulJobs = jobs.filter(j => j.type === 'delivery');

        const harvesterCount = harvestJobs.reduce((sum, j) =>
            sum + Object.keys(j.assignedCreepIds || {}).length, 0);
        const haulerCount = haulJobs.reduce((sum, j) =>
            sum + Object.keys(j.assignedCreepIds || {}).length, 0);

        const energyAvailable = room.energyAvailable || 0;
        const energyCapacity = room.energyCapacityAvailable || 0;

        const bootstrapHarvesters = harvesterCount < 1;
        const bootstrapHaulers = haulerCount < 2;

        let priority = 5; // Default priority
        if (bootstrapHarvesters || bootstrapHaulers) {
            if (bootstrapHarvesters && job.type === 'harvest') {
                priority = 1; // Critical - get energy flowing
            }
            else if (!bootstrapHarvesters && bootstrapHaulers && job.type === 'delivery') {
                priority = 1; // Critical - get energy flowing
            }
        }
        else {
            // Normal operation: energy flow model (harvest → haul → build → upgrade)
            if (job.type === 'harvest') {
                priority = 1; // Always high priority - energy production is critical
            } else if (job.type === 'delivery') {
                // Delivery priority based on urgency
                if (energyAvailable < 300) {
                    priority = 1; // Critical - spawn needs energy
                } else if (energyAvailable < energyCapacity * 0.5) {
                    priority = 2; // High - replenishing spawn
                } else {
                    priority = 3; // Normal hauling
                }
            } else if (job.type === 'build') {
                const constructionSite = Game.getObjectById(job.objectId);
                if (constructionSite && constructionSite.structureType === STRUCTURE_SPAWN) {
                    priority = 1; // Critical - spawns are highest priority
                } else if (constructionSite &&
                    (constructionSite.structureType === STRUCTURE_EXTENSION ||
                        constructionSite.structureType === STRUCTURE_TOWER)) {
                    priority = 5; // Important structures
                } else {
                    priority = 7; // Normal builds
                }
            } else if (job.type === 'upgrade') {
                // Upgrade priority scales with energy availability
                const storage = room.storage;
                const storedEnergy = storage ? (storage.store[RESOURCE_ENERGY] || 0) : 0;

                let energyState = 'normal';
                if (energyCapacity < 550) {
                    energyState = 'startup';
                } else if (storedEnergy > 100000 && energyAvailable >= energyCapacity * 0.9) {
                    energyState = 'abundant';
                } else if (storedEnergy > 10000) {
                    energyState = 'normal';
                } else {
                    energyState = 'tight';
                }

                if (energyState === 'abundant') {
                    priority = 4; // Higher priority when abundant
                } else if (energyState === 'normal') {
                    priority = 6; // Normal upgrade priority
                } else {
                    priority = 8; // Lower priority when energy is tight
                }
            }
        }

        const totalAssigned = Object.keys(job.assignedCreepIds || {}).length;
        const totalPending = Object.keys(job.pendingCreepIds || {}).length;

        // Boost priority slightly if job has no workers
        if (totalAssigned === 0 && totalPending === 0) {
            priority = Math.max(1, priority - 1);
        }

        // For upgrade jobs, reduce priority as more upgraders are assigned
        if (job.type === 'upgrade') {
            const totalWorkers = totalAssigned + totalPending;
            if (totalWorkers > 0) {
                priority = priority + (totalWorkers * 2); // Lower priority with more workers
            }
        }

        return Math.max(1, priority);
    }

    // Assign a creep to a job (handles reservations and bookkeeping)
    static assignJobToCreep(job, creep) {
        if (!job || !creep) return;

        // Ensure bookkeeping structures
        job.assignedCreepIds = job.assignedCreepIds || {};
        job.assignedObjectIds = job.assignedObjectIds || {};
        job.assignedCreepParts = job.assignedCreepParts || {};
        job.reservations = job.reservations || {};
        job.totalReserved = job.totalReserved || 0;

        // Handle reservation for pickup jobs or delivery jobs
        let totalNewReserved = 0;

        // Pickup jobs: reserve directly from the pickup job and mirror reservation on linked delivery
        if (job.type === 'pickup') {
            const resource = job.resource || RESOURCE_ENERGY;
            const creepFree = creep.store.getFreeCapacity(resource);
            const available = Math.max(0, (job.amount || 0) - (job.totalReserved || 0));
            const reserveAmount = Math.min(creepFree, available);
            if (reserveAmount > 0) {
                job.reservations[creep.name] = (job.reservations[creep.name] || 0) + reserveAmount;
                job.totalReserved = (job.totalReserved || 0) + reserveAmount;
                totalNewReserved += reserveAmount;

                // Mark creep memory sub-target
                creep.memory.jobSubTarget = { type: 'pickup', id: job.id };

                // If this pickup is linked to a delivery job, mirror reservation there so delivery can accept haulers
                if (job.deliveryJobId) {
                    const deliveryJobs = Memory.jobs[job.startRoom] || [];
                    const djob = deliveryJobs.find(j => j.id === job.deliveryJobId);
                    if (djob) {
                        djob.reservations = djob.reservations || {};
                        djob.totalReserved = (djob.totalReserved || 0) + reserveAmount;
                        djob.reservations[creep.name] = (djob.reservations[creep.name] || 0) + reserveAmount;
                    }
                }
            }
        }

        if (job.type === 'delivery') {
            const resource = job.resource || RESOURCE_ENERGY;
            const creepCarried = creep.store.getUsedCapacity(resource);
            if (creepCarried > 0) {
                job.reservations[creep.name] = (job.reservations[creep.name] || 0) + creepCarried;
                job.totalReserved = (job.totalReserved || 0) + creepCarried;
                totalNewReserved += creepCarried;
            }

            // If this delivery job has source sub-targets, and the creep has free capacity, reserve from a source
            const creepFree = creep.store.getFreeCapacity(resource);
            if (creepFree > 0 && job.sources && job.sources.length > 0) {
                // Find a source with available amount (prefer nearest)
                let bestIndex = -1;
                let bestDist = Infinity;
                for (let i = 0; i < job.sources.length; i++) {
                    const s = job.sources[i];
                    const sAvailable = Math.max(0, (s.amount || 0) - (s.totalReserved || 0));
                    if (sAvailable <= 0) continue;

                    let pos = null;
                    if (s.targetPos) pos = s.targetPos;
                    else if (s.objectId) {
                        const obj = Game.getObjectById(s.objectId);
                        if (obj && obj.pos) pos = obj.pos;
                    }
                    let dist = Infinity;
                    if (pos) {
                        dist = creep.pos.getRangeTo(pos.x, pos.y);
                    }
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestIndex = i;
                    }
                }

                if (bestIndex !== -1) {
                    const source = job.sources[bestIndex];
                    const sAvailable = Math.max(0, (source.amount || 0) - (source.totalReserved || 0));
                    const reserveAmount = Math.min(sAvailable, creepFree);
                    if (reserveAmount > 0) {
                        source.reservations = source.reservations || {};
                        source.reservations[creep.name] = (source.reservations[creep.name] || 0) + reserveAmount;
                        source.totalReserved = (source.totalReserved || 0) + reserveAmount;

                        // Also track at job-level for simplicity
                        job.reservations[creep.name] = (job.reservations[creep.name] || 0) + reserveAmount;
                        job.totalReserved = (job.totalReserved || 0) + reserveAmount;
                        totalNewReserved += reserveAmount;

                        // Mark creep memory sub-target
                        creep.memory.jobSubTarget = { type: 'source', id: source.id };
                    }
                }
            }
        }

        // Legacy pickup jobs are handled elsewhere; new model uses delivery.sources

        // If no reservation was created and creep carries nothing, don't assign
        if (((job.type === 'delivery') || (job.type === 'pickup')) && totalNewReserved === 0) {
            return 0;
        }

        // Perform assignment bookkeeping
        job.assignedCreepIds[creep.name] = Game.time;
        if (creep.id) job.assignedObjectIds[creep.id] = creep.name;

        const creepParts = creep.body.reduce((acc, part) => {
            if (!part.hits) return acc;
            const type = part.type.toUpperCase();
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        for (const partType in creepParts) {
            const count = creepParts[partType];
            job.assignedCreepParts[partType] = (job.assignedCreepParts[partType] || 0) + count;
        }

        // Update creep memory
        creep.memory.jobId = job.id;
        creep.memory.jobRoom = job.startRoom;
        return totalNewReserved;
    }

    // Unassign a creep from a job (releases reservations and bookkeeping)
    static unassignJobFromCreep(job, creep) {
        if (!job || !creep) return;

        job.reservations = job.reservations || {};
        job.totalReserved = job.totalReserved || 0;

        // Release reservation for this creep
        if (job.reservations && job.reservations[creep.name]) {
            const amount = job.reservations[creep.name];
            delete job.reservations[creep.name];
            job.totalReserved = Math.max(0, (job.totalReserved || 0) - amount);
        }

        // If this was a hidden pickup linked to a delivery, also release mirrored reservation on delivery
        if (job.type === 'pickup' && job.deliveryJobId) {
            const deliveryJobs = Memory.jobs[job.startRoom] || [];
            const djob = deliveryJobs.find(j => j.id === job.deliveryJobId);
            if (djob && djob.reservations && djob.reservations[creep.name]) {
                const damount = djob.reservations[creep.name];
                delete djob.reservations[creep.name];
                djob.totalReserved = Math.max(0, (djob.totalReserved || 0) - damount);
            }
        }

        // Release any source-level reservations if present
        if (job.sources && job.sources.length > 0) {
            for (const s of job.sources) {
                if (s.reservations && s.reservations[creep.name]) {
                    const samount = s.reservations[creep.name];
                    delete s.reservations[creep.name];
                    s.totalReserved = Math.max(0, (s.totalReserved || 0) - samount);
                    // Also decrement job-level totalReserved if it was counted there
                    job.totalReserved = Math.max(0, (job.totalReserved || 0) - samount);
                }
            }
        }

        // Remove assigned creep bookkeeping
        if (job.assignedCreepIds && job.assignedCreepIds[creep.name]) {
            delete job.assignedCreepIds[creep.name];
            if (creep.id && job.assignedObjectIds) {
                delete job.assignedObjectIds[creep.id];
            }
            if (job.assignedCreepParts) {
                const creepParts = creep.body.reduce((acc, part) => {
                    if (!part.hits) return acc;
                    const type = part.type.toUpperCase();
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {});
                for (const partType in creepParts) {
                    const count = creepParts[partType];
                    job.assignedCreepParts[partType] = Math.max(0, (job.assignedCreepParts[partType] || 0) - count);
                }
            }
        }

        // Clear creep memory
        delete creep.memory.jobId;
        delete creep.memory.jobRoom;
        delete creep.memory.haulState;
        delete creep.memory.jobSubTarget;
        return job;
    }
}

