import JobsManager from '../../jobs/jobsManager.js';
import JobParts from '../../utils/jobParts.js';

/**
 * Manages predictions for a specific room
 * Handles energy income forecasts, job ETAs, and spawn queue predictions
 */
export default class PredictingPartHandler {
    constructor(room, jobsRoomPartHandler) {
        this.room = room;
        this.roomName = room.name;
        this.jobsRoomPartHandler = jobsRoomPartHandler;
    }

    /**
     * Predict energy income over time based on harvest jobs
     * @param {number} ticksAhead - How many ticks ahead to predict
     * @param {Object} options - Prediction options
     * @param {number} options.step - Tick interval for predictions
     * @returns {Array} Array of {tick, income} predictions
     */
    predictEnergyIncome(ticksAhead = 500, options = {}) {
        const step = options.step || 10;
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();
        const harvestJobs = jobs.filter(j => j.type === 'harvest');

        // Cache source objects to limit Game.getObjectById calls
        const sourceCache = new Map();
        for (const job of harvestJobs) {
            if (!sourceCache.has(job.objectId)) {
                sourceCache.set(job.objectId, Game.getObjectById(job.objectId));
            }
        }

        const predictions = [];
        for (let t = 0; t <= ticksAhead; t += step) {
            const futureTick = Game.time + t;
            let totalIncome = 0;

            for (const job of harvestJobs) {
                const source = sourceCache.get(job.objectId);
                if (!source) continue;

                const energyPerTick = source.energyCapacity / 300;
                const assignedWorkParts = (job.assignedCreepParts && job.assignedCreepParts.WORK) || 0;
                const pendingWorkParts = (job.pendingCreepParts && job.pendingCreepParts.WORK) || 0;
                const totalWorkParts = assignedWorkParts + pendingWorkParts;

                const effectiveWorkParts = Math.min(totalWorkParts, energyPerTick);
                totalIncome += effectiveWorkParts * 2;
            }

            predictions.push({ tick: futureTick, income: totalIncome });
        }

        return predictions;
    }

    /**
     * Update ETAs for all jobs in the room
     * Sets arrivalETA and completionETA on job objects
     */
    updateJobETAs() {
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();

        // Cache all game objects to limit Game.getObjectById calls
        const objectCache = new Map();
        for (const job of jobs) {
            if (job.objectId && !objectCache.has(job.objectId)) {
                objectCache.set(job.objectId, Game.getObjectById(job.objectId));
            }
        }

        for (const job of jobs) {
            if (job.type === 'harvest') {
                this._updateHarvestJobETA(job, objectCache);
            } else if (job.type === 'haul') {
                this._updateHaulJobETA(job);
            } else if (job.type === 'build') {
                this._updateBuildJobETA(job, objectCache);
            } else if (job.type === 'upgrade') {
                this._updateUpgradeJobETA(job);
            }
        }
    }

    /**
     * Build spawn queue forecast for future creep spawns
     * @param {number} ticksAhead - How far ahead to forecast
     * @returns {Array} Array of spawn queue entries with job and tick
     */
    buildSpawnQueue(ticksAhead = 500) {
        const room = this.room;
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();
        const queue = [];

        for (const job of jobs) {
            if (job.creepType !== 'worker') continue;

            const totalAssigned = Object.keys(job.assignedCreepIds || {}).length;
            const totalPending = Object.keys(job.pendingCreepIds || {}).length;

            const assignedCreeps = Object.keys(job.assignedCreepIds || {}).map(name => Game.creeps[name]).filter(c => c);

            const deathTimes = assignedCreeps.map(c => JobsManager.getCreepDeathTick(c));

            for (const deathTick of deathTimes) {
                if (deathTick <= Game.time + ticksAhead) {
                    queue.push({
                        job,
                        tick: Math.max(Game.time, deathTick - 50),
                        reason: 'replacement'
                    });
                }
            }

            if (job.capacityType === 'scalable') {
                const wantedAtCapacity = JobParts.scalePartsForEnergy(job.wantedCreepParts, room.energyCapacityAvailable || 300);
                const missingParts = JobParts.getMissingWantedParts(wantedAtCapacity, job.assignedCreepParts, job.pendingCreepParts);
                const hasAnyMissing = Object.values(missingParts).some(count => count > 0);

                if (hasAnyMissing && totalPending === 0) {
                    queue.push({
                        job,
                        tick: Game.time,
                        reason: 'scale'
                    });
                }
            } else if (job.capacityType === 'fixed') {
                const missingParts = JobParts.getMissingWantedParts(job.wantedCreepParts, job.assignedCreepParts, job.pendingCreepParts);
                const hasAnyMissing = Object.values(missingParts).some(count => count > 0);

                if (hasAnyMissing && totalPending === 0) {
                    queue.push({
                        job,
                        tick: Game.time,
                        reason: 'fixed'
                    });
                }
            }
        }

        queue.sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            const priorityA = JobsManager.calculateEffectivePriority(room, a.job);
            const priorityB = JobsManager.calculateEffectivePriority(room, b.job);
            return priorityA - priorityB;
        });

        return queue;
    }

    // Private helper methods for updating job ETAs

    _updateHarvestJobETA(job, objectCache) {
        const source = objectCache.get(job.objectId);
        const assignedCreeps = Object.keys(job.assignedCreepIds || {});

        if (source && assignedCreeps.length > 0) {
            const harvester = Game.creeps[assignedCreeps[0]];
            if (harvester && source.energy > 0) {
                const distance = harvester.pos.getRangeTo(source.pos);
                job.arrivalETA = Math.ceil(distance * 1.3);

                const remainingEnergy = source.energy;
                const workParts = (job.assignedCreepParts && job.assignedCreepParts.WORK) || 0;
                const harvestRate = workParts * 2;
                job.completionETA = harvestRate > 0 ? Math.ceil(remainingEnergy / harvestRate) : null;
            } else {
                job.arrivalETA = null;
                job.completionETA = null;
            }
        } else {
            job.arrivalETA = null;
            job.completionETA = null;
        }
    }

    _updateHaulJobETA(job) {
        const assignedCreeps = Object.keys(job.assignedCreepIds || {});

        if (assignedCreeps.length > 0) {
            const hauler = Game.creeps[assignedCreeps[0]];
            if (hauler && job.targetPos) {
                const targetPos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
                const distance = hauler.pos.getRangeTo(targetPos);
                job.arrivalETA = Math.ceil(distance * 1.3);
            } else {
                job.arrivalETA = null;
            }

            const totalCarryParts = (job.assignedCreepParts && job.assignedCreepParts.CARRY) || 0;
            const totalCapacity = totalCarryParts * 50;
            const roundTripTime = job.roundTripTime || 50;
            job.completionETA = totalCapacity > 0 ? Math.ceil((job.amount / totalCapacity) * roundTripTime) : null;
        } else {
            job.arrivalETA = null;
            job.completionETA = null;
        }
    }

    _updateBuildJobETA(job, objectCache) {
        const site = objectCache.get(job.objectId);
        const assignedCreeps = Object.keys(job.assignedCreepIds || {});

        if (site && assignedCreeps.length > 0) {
            const builder = Game.creeps[assignedCreeps[0]];
            if (builder) {
                const distance = builder.pos.getRangeTo(site.pos);
                job.arrivalETA = Math.ceil(distance * 1.3);

                const remainingProgress = site.progressTotal - site.progress;
                const workParts = (job.assignedCreepParts && job.assignedCreepParts.WORK) || 0;
                const buildRate = workParts * 5;
                job.completionETA = buildRate > 0 ? Math.ceil(remainingProgress / buildRate) : null;
            } else {
                job.arrivalETA = null;
                job.completionETA = null;
            }
        } else {
            job.arrivalETA = null;
            job.completionETA = null;
        }
    }

    _updateUpgradeJobETA(job) {
        const controller = this.room.controller;
        const assignedCreeps = Object.keys(job.assignedCreepIds || {});

        if (!controller) return;

        const upgrader = Game.creeps[assignedCreeps[0]];
        if (upgrader) {
            const distance = upgrader.pos.getRangeTo(controller.pos);
            job.arrivalETA = Math.ceil(distance * 1.3);
        } else {
            job.arrivalETA = null;
        }
        job.completionETA = null;
    }
}
