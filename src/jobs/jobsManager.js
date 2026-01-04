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
        const haulJobs = jobs.filter(j => j.type === 'delivery' || j.type === 'pickup');

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
            else if (!bootstrapHarvesters && bootstrapHaulers && (job.type === 'delivery' || job.type === 'pickup')) {
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
            } else if (job.type === 'pickup') {
                // Pickup priority based on resource type and amount
                if (job.resourceType === 'dropped') {
                    priority = 2; // High priority for large drops
                } else if (job.resourceType === 'container') {
                    priority = 3; // Normal container pickup
                } else {
                    priority = 4; // Lower priority for other pickups
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
}

