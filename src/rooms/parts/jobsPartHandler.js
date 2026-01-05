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

    getEnergyState() {
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
        else if (energyCapacity > 0 && currentEnergy < energyCapacity * 0.5) {
            return 'tight';
        }

        return 'normal';
    }
}
