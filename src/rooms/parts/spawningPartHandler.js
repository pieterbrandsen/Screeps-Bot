import JobsManager from "../../jobs/jobsManager.js";
import Debug from "../../debug/debug.js";
import CreepBody from "../../utils/creepBody.js";
import JobParts from "../../utils/jobParts.js";
import Constants from "../../utils/constants.js";
import CreepFactory from "../../workers/creeps/creepFactory.js";

export default class SpawningPartHandler {
    constructor(room, spawn, jobsPartHandler, predictingPartHandler) {
        this.room = room;
        this.spawn = spawn;
        this.jobsPartHandler = jobsPartHandler;
        this.predictingPartHandler = predictingPartHandler;

        this.ensureMemory();
    }

    ensureMemory() {
        if (!this.room.memory.spawnQueue) this.room.memory.spawnQueue = [];
    }

    run() {
        const spawnQueue = this.room.memory.spawnQueue;

        // Build spawn queue if empty or needs refresh
        if (spawnQueue.length === 0 || Game.time % 10 === 0) {
            this._rebuildSpawnQueue();
        }

        // Try to spawn next item in queue (FIFO)
        if (spawnQueue.length === 0) return;

        const nextSpawn = spawnQueue[0];
        const energyAvailable = this.room.energyAvailable;

        // Check if this spawn is overdue (prediction was wrong)
        const isOverdue = nextSpawn.targetTick && Game.time > nextSpawn.targetTick;

        if (isOverdue) {
            // Recalculate body with current energy
            if (Debug.throttle(`spawnOverdue:${this.spawn.name}:${nextSpawn.jobId}`, 10, this.room.name)) {
                Debug.log(this.room.name, 'warn', `spawn:overdue ${this.spawn.name}`, {
                    jobId: nextSpawn.jobId,
                    targetTick: nextSpawn.targetTick,
                    currentTick: Game.time,
                    plannedCost: nextSpawn.cost,
                    actualEnergy: energyAvailable
                });
            }

            // Recalculate with current energy
            const job = this._getJobById(nextSpawn.jobId);
            if (!job) {
                spawnQueue.shift(); // Job no longer exists
                return;
            }

            const newPlan = this._calculateBodyPlan(job, energyAvailable);
            if (!newPlan) {
                spawnQueue.shift(); // Can't build valid body
                return;
            }

            // Update queue entry
            nextSpawn.body = newPlan.body;
            nextSpawn.cost = newPlan.cost;
            nextSpawn.parts = newPlan.usedCounts;
            nextSpawn.targetTick = null; // Don't defer again
        }

        // Can we afford it now?
        if (energyAvailable >= nextSpawn.cost) {
            this._spawnFromQueue(spawnQueue, nextSpawn);
        }
        // If we can't afford it, just wait - FIFO ensures priority
    }

    _spawnFromQueue(spawnQueue, spawnEntry) {
        const creepName = `${spawnEntry.jobType}-${Game.time}-${Math.floor(Math.random() * 1000)}`;
        const spawnResult = this.spawn.spawnCreep(spawnEntry.body, creepName, {
            memory: {
                type: spawnEntry.creepType,
                parts: spawnEntry.parts,
                jobId: spawnEntry.jobId,
                jobRoom: spawnEntry.jobRoom
            }
        });

        if (spawnResult === OK) {
            Debug.count(this.room.name, 'spawn');
            Debug.log(this.room.name, 'info', `spawn:started ${this.spawn.name} -> ${creepName}`, {
                jobId: spawnEntry.jobId,
                jobType: spawnEntry.jobType,
                cost: spawnEntry.cost,
                body: spawnEntry.parts
            });

            // Remove from queue and track pending
            spawnQueue.shift();
            this.jobsPartHandler.updatePendingCreepParts(
                spawnEntry.jobId,
                creepName,
                spawnEntry.parts
            );
        } else if (spawnResult !== ERR_BUSY && Debug.throttle(`spawnFail:${this.spawn.name}`, 25, this.room.name)) {
            Debug.log(this.room.name, 'warn', `spawn:failed ${this.spawn.name} code=${spawnResult}`, {
                jobId: spawnEntry.jobId,
                energy: this.room.energyAvailable,
                needed: spawnEntry.cost
            });
        }
    }

    _rebuildSpawnQueue() {
        const candidates = this.jobsPartHandler.getCreepSpawnCandidates();
        if (!candidates || candidates.length === 0) {
            this.room.memory.spawnQueue = [];
            return;
        }

        const newQueue = [];

        for (const c of candidates) {
            const job = c.job;
            if (!job) continue;

            const missingMainParts = JobParts.getMissingWantedParts(
                job.wantedCreepParts,
                job.assignedCreepParts,
                job.pendingCreepParts
            );

            if (Object.keys(missingMainParts).length === 0) continue;

            const bodyPlan = this._calculateBodyPlan(job, this.room.energyCapacityAvailable);
            if (!bodyPlan) continue;

            // Predict when we can afford this
            let targetTick = null;
            const energyAvailable = this.room.energyAvailable;

            if (energyAvailable < bodyPlan.cost) {
                const predictions = this.predictingPartHandler.predictEnergyIncome(Constants.WAIT_WINDOW_TICKS, { step: 5 });
                for (const p of predictions) {
                    if (p.energy >= bodyPlan.cost) {
                        targetTick = p.tick;
                        break;
                    }
                }
            }

            newQueue.push({
                jobId: job.id,
                jobType: job.type,
                creepType: job.creepType,
                jobRoom: job.startRoom,
                body: bodyPlan.body,
                cost: bodyPlan.cost,
                parts: bodyPlan.usedCounts,
                targetTick: targetTick,
                priority: c.priority,
                createdAt: Game.time
            });
        }

        this.room.memory.spawnQueue = newQueue;
    }

    _calculateBodyPlan(job, maxEnergy) {
        // Use CreepFactory to build specialized bodies for each creep type
        const CreepClass = CreepFactory.getCreepClass(job.creepType);

        if (!CreepClass) {
            console.log(`SpawningPartHandler: No CreepClass found for creepType: ${job.creepType}`);
            return null;
        }

        // Use the specialized body building method
        const body = CreepClass.getBody(maxEnergy);
        if (!body || body.length === 0) return null;

        // Calculate cost and part counts from the body
        const cost = body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
        const usedCounts = CreepBody.getPartCountsFromBody(body);

        if (cost <= 0 || cost > maxEnergy) return null;

        return { body, cost, usedCounts };
    }

    _getJobById(jobId) {
        const candidates = this.jobsPartHandler.getCreepSpawnCandidates();
        const candidate = candidates.find(c => c && c.job && c.job.id === jobId);
        return candidate ? candidate.job : null;
    }
}