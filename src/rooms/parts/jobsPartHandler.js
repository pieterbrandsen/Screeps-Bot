import Debug from '../../debug/debug.js';
import RoomTravel from '../roomTravel.js';
import CreepBody from '../../utils/creepBody.js';
import JobParts from '../../utils/jobParts.js';
import JobsManager from '../../jobs/jobsManager.js';
import Constants from '../../utils/constants.js';

/**
 * Manages all job operations for a specific room.
 * This is the room-scoped part of the job system.
 */
export default class JobsRoomPartHandler {
    constructor(room) {
        this.room = room;
        this.roomName = room.name;
    }

    /**
     * Returns what the spawner is likely to do THIS tick, using the same rules as SpawningPartHandler:
     * - respect per-room spawnPlan.deferred
     * - strict wait-for-big-body behavior
     * - affordability checks vs current energy
     *
     * Result:
     *  { action: 'spawn', job, cost }
     *  { action: 'wait', reason, jobId?, untilTick?, cost? }
     *  { action: 'none' }
     */
    getSpawnDecision() {
        const room = this.room;
        if (!room) return { action: 'none' };

        const WAIT_WINDOW_TICKS = Constants.WAIT_WINDOW_TICKS;
        const MIN_ENERGY_FRACTION_TO_WAIT = Constants.MIN_ENERGY_FRACTION_TO_WAIT;

        const candidates = this.getCreepSpawnCandidates();
        if (!candidates || candidates.length === 0) return { action: 'none' };

        const energyState = this.getEnergyState();
        const energyAvailable = room.energyAvailable || 0;
        const emergencyBootstrap = (energyState === 'startup') && this.isEmergencyBootstrap();

        const deferredMem = (room.memory && room.memory.spawnPlan && room.memory.spawnPlan.deferred)
            ? room.memory.spawnPlan.deferred
            : null;

        // STRICT: if we have any deferred big-body job, we wait for it (except emergency bootstrap).
        if (!emergencyBootstrap && deferredMem) {
            let primaryDeferred = null;
            for (const jobId in deferredMem) {
                const entry = deferredMem[jobId];
                if (!entry || !entry.untilTick || entry.untilTick <= Game.time) continue;
                if (!primaryDeferred || entry.untilTick < primaryDeferred.untilTick) {
                    primaryDeferred = { jobId: String(jobId), untilTick: entry.untilTick, desiredCost: entry.desiredCost || null };
                }
            }

            if (primaryDeferred) {
                return {
                    action: 'wait',
                    reason: 'deferredBigBody',
                    jobId: primaryDeferred.jobId,
                    untilTick: primaryDeferred.untilTick,
                    cost: primaryDeferred.desiredCost
                };
            }
        }

        for (const c of candidates) {
            const spawnJob = c && c.job;
            if (!spawnJob) continue;

            // Respect per-room deferrals.
            if (deferredMem) {
                const def = deferredMem[String(spawnJob.id)];
                if (def && def.untilTick && def.untilTick > Game.time) {
                    continue;
                }
            }

            const missingMainParts = JobParts.getMissingWantedParts(
                spawnJob.wantedCreepParts,
                spawnJob.assignedCreepParts,
                spawnJob.pendingCreepParts
            );

            let requiredCounts = missingMainParts;
            if (spawnJob.capacityType === 'scalable' && energyState !== 'startup') {
                const wantedCounts = JobParts.scalePartsForEnergy(spawnJob.wantedCreepParts, room.energyCapacityAvailable || 300);
                requiredCounts = JobParts.getMissingWantedParts(wantedCounts, spawnJob.assignedCreepParts, spawnJob.pendingCreepParts);
            }

            const requiredEnergy = CreepBody.calculateCostFromCounts(requiredCounts);

            if (requiredEnergy < 200) {
                requiredCounts = JobParts.distributePartsToEnergy(200);
            }

            const cost = CreepBody.calculateCostFromCounts(requiredCounts);
            const canAffordMin = (energyAvailable >= 200);
            const canAffordBig = (energyAvailable >= cost);

            // Emergency bootstrap: spawn a tiny body if we can't build what we want
            if (emergencyBootstrap && !canAffordBig && canAffordMin) {
                return {
                    action: 'spawn',
                    job: spawnJob,
                    cost: 200
                };
            }

            // Strict wait: if we can't afford the big body, wait a bit
            if (!canAffordBig) {
                const ticksRemaining = WAIT_WINDOW_TICKS - (Game.time % WAIT_WINDOW_TICKS);
                const fraction = (energyAvailable / cost);

                if (fraction >= MIN_ENERGY_FRACTION_TO_WAIT && ticksRemaining > 5) {
                    return {
                        action: 'wait',
                        reason: 'waitForBigBody',
                        jobId: spawnJob.id,
                        untilTick: Game.time + ticksRemaining,
                        cost
                    };
                }
            }

            if (canAffordMin) {
                return {
                    action: 'spawn',
                    job: spawnJob,
                    cost: canAffordBig ? cost : 200
                };
            }

            return {
                action: 'wait',
                reason: 'noEnergy',
                jobId: spawnJob.id
            };
        }

        return { action: 'none' };
    }

    createJob(jobData) {
        const originatorRoom = jobData.startRoom;
        if (!Memory.jobs[originatorRoom]) {
            Memory.jobs[originatorRoom] = [];
        }

        // Normalize wanted parts to uppercase keys (WORK/CARRY/MOVE...).
        jobData.wantedCreepParts = JobsManager.normalizePartCounts(jobData.wantedCreepParts);

        jobData.assignedCreepIds = {};
        jobData.assignedObjectIds = {};
        jobData.assignedCreepParts = {};

        jobData.pendingCreepIds = {};
        jobData.pendingObjectIds = {};
        jobData.pendingCreepParts = {};

        // Initialize reservations tracking
        jobData.reservations = {};
        jobData.totalReserved = 0;

        if (!jobData.capacityType) {
            jobData.capacityType = 'fixed'; // Default to fixed capacity
        }

        Memory.jobs[originatorRoom].push(jobData);

        Debug.count(originatorRoom, 'jobCreate');
        Debug.log(originatorRoom, 'info', `job:create ${jobData.id} ${jobData.type}`, {
            capacityType: jobData.capacityType,
            max: jobData.maxCreepAssignments,
            creepType: jobData.creepType
        });
    }

    updateJob(jobId, updatedData) {
        const jobs = Memory.jobs[this.roomName] || [];
        const jobIndex = jobs.findIndex(job => job.id === jobId);
        if (jobIndex !== -1) {
            if (updatedData && updatedData.wantedCreepParts) {
                updatedData.wantedCreepParts = JobsManager.normalizePartCounts(updatedData.wantedCreepParts);
            }
            Object.assign(jobs[jobIndex], updatedData);
            JobsManager.normalizeWantedPartsInPlace(jobs[jobIndex]);
        }
    }

    deleteJob(jobId) {
        if (!Memory.jobs[this.roomName]) return;
        const jobs = Memory.jobs[this.roomName];
        const jobIndex = jobs.findIndex(job => job.id === jobId);
        if (jobIndex !== -1) {
            Debug.log(this.roomName, 'info', `job:delete ${jobId}`, { type: jobs[jobIndex].type });
            jobs.splice(jobIndex, 1);
        }
    }

    getJobsForRoom() {
        const jobs = Memory.jobs[this.roomName] || [];
        for (const job of jobs) {
            JobsManager.normalizeWantedPartsInPlace(job);
        }
        return jobs;
    }

    getJobsByType(type) {
        const jobs = this.getJobsForRoom();
        return jobs.filter(job => job.type === type);
    }

    getJobById(jobId) {
        const jobs = this.getJobsForRoom();
        return jobs.find(job => job.id === jobId);
    }

    getJobByObjectId(objectId) {
        const jobs = this.getJobsForRoom();
        return jobs.find(job => job.objectId === objectId);
    }

    reserveEnergy(jobId, creepName, amount) {
        const job = this.getJobById(jobId);
        if (!job) return false;

        if (!job.reservations) {
            job.reservations = {};
        }

        if (!job.totalReserved) {
            job.totalReserved = 0;
        }

        if (job.reservations[creepName] !== undefined) {
            const previousAmount = job.reservations[creepName];
            job.totalReserved -= previousAmount;
        }

        job.reservations[creepName] = amount;
        job.totalReserved += amount;

        return true;
    }

    releaseReservation(jobId, creepName) {
        const job = this.getJobById(jobId);
        if (!job) return;

        if (!job.reservations || job.reservations[creepName] === undefined) {
            return;
        }

        const amount = job.reservations[creepName];
        delete job.reservations[creepName];
        job.totalReserved = Math.max(0, (job.totalReserved || 0) - amount);

        return amount;
    }

    getAvailableAmount(jobId) {
        const job = this.getJobById(jobId);
        if (!job) {
            return 0;
        }

        const totalReserved = job.totalReserved || 0;
        return Math.max(0, job.amount - totalReserved);
    }

    cleanupDeadReservations() {
        const jobs = this.getJobsForRoom();

        for (const job of jobs) {
            if (!job.reservations) continue;

            for (const reservationId in job.reservations) {
                const creepName = reservationId;
                if (!Game.creeps[creepName]) {
                    const amount = job.reservations[reservationId];
                    delete job.reservations[reservationId];
                    job.totalReserved = Math.max(0, (job.totalReserved || 0) - amount);

                    Debug.log(this.roomName, 'debug', `job:cleanReservation ${job.id} ${creepName} ${amount}`);
                }
            }
        }
    }

    assignJobToCreep(jobId, creepId, startTime) {
        const job = this.getJobById(jobId);
        if (!job) {
            console.log(`JobsRoomPartHandler.assignJobToCreep: job not found ${jobId} in room ${this.roomName}`);
            return;
        }

        const creep = Game.creeps[creepId];
        if (!creep) {
            console.log(`JobsRoomPartHandler.assignJobToCreep: creep not found ${creepId}`);
            return;
        }

        job.assignedCreepIds[creepId] = startTime;
        if (creep.id) {
            job.assignedObjectIds[creep.id] = creepId;
        }
    }

    unassignJobFromCreep(jobId, creepId) {
        const job = this.getJobById(jobId);
        if (!job) return;

        if (job.assignedCreepIds && job.assignedCreepIds[creepId]) {
            delete job.assignedCreepIds[creepId];
        }

        const creep = Game.creeps[creepId];
        if (creep && creep.id && job.assignedObjectIds) {
            delete job.assignedObjectIds[creep.id];
        }
    }

    updatePendingCreepParts(jobId, creepName, partCounts) {
        const job = this.getJobById(jobId);
        if (!job) {
            console.log(`JobsRoomPartHandler.updatePendingCreepParts: job not found ${jobId} in room ${this.roomName}`);
            return;
        }

        if (!job.pendingCreepIds) job.pendingCreepIds = {};
        if (!job.pendingCreepParts) job.pendingCreepParts = {};

        // Add creep to pending list
        job.pendingCreepIds[creepName] = Game.time;

        // Add parts to pending parts count
        for (const partType in partCounts) {
            const count = partCounts[partType] || 0;
            job.pendingCreepParts[partType] = (job.pendingCreepParts[partType] || 0) + count;
        }
    }

    getNextCreepToSpawn() {
        const candidates = this.getCreepSpawnCandidates();
        if (!candidates || candidates.length === 0) {
            return null;
        }
        return candidates[0].job;
    }

    getCreepSpawnCandidates() {
        const jobs = this.getJobsForRoom();
        const candidates = [];
        const energyState = this.getEnergyState();

        for (const job of jobs) {
            // Accept all creepTypes: harvester, hauler, upgrader, worker
            if (!job.creepType) continue;

            const totalAssigned = Object.keys(job.assignedCreepIds || {}).length;
            const totalPending = Object.keys(job.pendingCreepIds || {}).length;
            const totalWorkers = totalAssigned + totalPending;

            if (job.maxCreepAssignments !== undefined && totalWorkers >= job.maxCreepAssignments) {
                continue;
            }

            if (job.capacityType === 'fixed') {
                const missingParts = JobParts.getMissingWantedParts(
                    job.wantedCreepParts,
                    job.assignedCreepParts,
                    job.pendingCreepParts
                );

                const hasAnyMissing = Object.values(missingParts).some(count => count > 0);
                if (!hasAnyMissing) {
                    continue;
                }
            } else if (job.capacityType === 'scalable') {
                if (energyState === 'startup' && totalWorkers >= 1) {
                    continue;
                }
            }

            const effectivePriority = JobsManager.calculateEffectivePriority(this.room, job);
            candidates.push({ job, priority: effectivePriority });
        }

        candidates.sort((a, b) => a.priority - b.priority);
        return candidates;
    }

    isEmergencyBootstrap() {
        if (!this.room.controller || !this.room.controller.my) return false;

        const spawns = this.room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return false;

        const hasSpawnEnergy = spawns.some(spawn => spawn.store.getUsedCapacity(RESOURCE_ENERGY) >= 50);
        if (hasSpawnEnergy) return false;

        const extensions = this.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        });

        const hasExtensionEnergy = extensions.some(ext => ext.store.getUsedCapacity(RESOURCE_ENERGY) > 0);
        if (hasExtensionEnergy) return false;

        const containers = this.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });

        const hasContainerEnergy = containers.some(c => c.store.getUsedCapacity(RESOURCE_ENERGY) >= 200);
        if (hasContainerEnergy) return false;

        const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY && r.amount >= 50
        });

        if (dropped.length > 0) return false;

        const jobs = this.getJobsForRoom();
        const harvesters = jobs.filter(j => j.type === 'harvest')
            .flatMap(j => Object.keys(j.assignedCreepIds || {}))
            .map(name => Game.creeps[name])
            .filter(c => c && c.store.getUsedCapacity(RESOURCE_ENERGY) >= 50);

        if (harvesters.length === 0) return true;

        return false;
    }

    getEnergyState() {
        const spawns = this.room.find(FIND_MY_SPAWNS);
        const extensions = this.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        });

        const energyCapacity = this.room.energyCapacityAvailable || 0;
        const currentEnergy = this.room.energyAvailable || 0;
        const storage = this.room.storage;
        const storedEnergy = storage ? (storage.store[RESOURCE_ENERGY] || 0) : 0;

        if (energyCapacity < 550) {
            return 'startup';
        }

        if (storedEnergy > 100000 && currentEnergy >= energyCapacity * 0.9) {
            return 'abundant';
        }

        const spawnsNeedEnergy = spawns.some(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        const extensionsNeedEnergy = extensions.some(e => e.store.getFreeCapacity(RESOURCE_ENERGY) > 0);

        if (spawnsNeedEnergy || extensionsNeedEnergy) {
            return 'tight';
        }

        if (storedEnergy > 10000) {
            return 'normal';
        }

        return 'tight';
    }

    getEnergyState() {
        const spawns = this.room.find(FIND_MY_SPAWNS);
        const extensions = this.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        });

        const energyCapacity = this.room.energyCapacityAvailable || 0;
        const currentEnergy = this.room.energyAvailable || 0;
        const storage = this.room.storage;
        const storedEnergy = storage ? (storage.store[RESOURCE_ENERGY] || 0) : 0;

        if (energyCapacity < 550) {
            return 'startup';
        }

        if (storedEnergy > 100000 && currentEnergy >= energyCapacity * 0.9) {
            return 'abundant';
        }

        const spawnsNeedEnergy = spawns.some(s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0);
        const extensionsNeedEnergy = extensions.some(e => e.store.getFreeCapacity(RESOURCE_ENERGY) > 0);

        if (spawnsNeedEnergy || extensionsNeedEnergy) {
            return 'tight';
        }

        if (storedEnergy > 10000) {
            return 'normal';
        }

        return 'tight';
    }
}
