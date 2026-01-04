import Debug from "../debug/debug.js";
import WorkerManager from "./workerManager.js";

export default class WorkersManager {
    static run() {
        // Clean up dead creeps from job assignments
        this.cleanupDeadCreeps();

        const creeps = Object.entries(Game.creeps);
        for (const [name, creep] of creeps) {
            const workerManager = new WorkerManager(creep);
            workerManager.manage();
        }
    }

    static cleanupDeadCreeps() {
        // Check all rooms for dead creeps in job assignments
        const jobsEntries = Object.entries(Memory.jobs);
        for (const [roomName, jobs] of jobsEntries) {
            for (const job of jobs) {
                // Clean up assigned creeps
                for (const creepId in (job.assignedCreepIds || {})) {
                    if (!Game.creeps[creepId]) {
                        // Direct Memory access for cross-room cleanup
                        const jobs = Memory.jobs[roomName];
                        const jobToUpdate = jobs.find(j => j.id === job.id);
                        if (jobToUpdate && jobToUpdate.assignedCreepIds) {
                            delete jobToUpdate.assignedCreepIds[creepId];
                        }
                    }
                }

                // Clean up pending creeps that have spawned
                for (const creepName in (job.pendingCreepIds || {})) {
                    const creep = Game.creeps[creepName];
                    if (creep && creep.spawning === false) {
                        // Creep has spawned, transfer from pending to assigned
                        delete job.pendingCreepIds[creepName];
                        if (creep.id && job.pendingObjectIds) {
                            delete job.pendingObjectIds[creep.id];
                        }
                        const creepParts = creep.memory.parts;
                        if (job.pendingCreepParts) {
                            for (const partType in creepParts) {
                                const count = creepParts[partType];
                                job.pendingCreepParts[partType] = Math.max(0, (job.pendingCreepParts[partType] || 0) - count);
                            }
                        }

                        // Assign to job
                        job.assignedCreepIds[creepName] = Game.time;
                        if (creep.id) {
                            job.assignedObjectIds[creep.id] = creepName;
                        }
                        for (const partType in creepParts) {
                            const count = creepParts[partType];
                            job.assignedCreepParts[partType] = (job.assignedCreepParts[partType] || 0) + count;
                        }
                        creep.memory.jobId = job.id;
                        creep.memory.jobRoom = roomName;

                        Debug.log(roomName, 'info', `spawn:assigned ${creepName} -> ${job.id}`, {
                            type: job.type,
                            creepType: creep.memory.type
                        });
                    }
                }
            }

            // Clean up reservations for dead creeps
            for (const job of jobs) {
                if (!job.reservations) continue;
                for (const reservationId in job.reservations) {
                    const creepName = reservationId;
                    if (!Game.creeps[creepName]) {
                        const amount = job.reservations[reservationId];
                        delete job.reservations[reservationId];
                        job.totalReserved = Math.max(0, (job.totalReserved || 0) - amount);
                    }
                }
            }
        }
    }
}