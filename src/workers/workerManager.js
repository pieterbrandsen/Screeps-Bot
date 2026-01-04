import TasksManager from "../jobs/tasks/tasksManager.js";
import Debug from "../debug/debug.js";
import JobsManager from "../jobs/jobsManager.js";

export default class WorkerManager {
    constructor(creep) {
        this.creep = creep;
    }

    manage() {
        const creep = this.creep;
        // If creep has a job assignment, work on it
        if (creep.memory.jobId && creep.memory.jobRoom) {
            const jobs = Memory.jobs[creep.memory.jobRoom] || [];
            const job = jobs.find(j => j.id === creep.memory.jobId);

            if (!job) {
                // Job no longer exists, clear assignment
                Debug.log(creep.room.name, 'warn', `creep:lostJob ${creep.name} ${creep.memory.jobId}`);
                delete creep.memory.jobId;
                delete creep.memory.jobRoom;
                creep.say('❓');
                return;
            }

            // Check if this job has too many workers assigned
            if (job.maxCreepAssignments !== undefined) {
                const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
                const pendingCount = Object.keys(job.pendingCreepIds || {}).length;
                const totalAssigned = assignedCount + pendingCount;

                if (totalAssigned > job.maxCreepAssignments) {
                    // Too many workers on this job, unassign this creep
                    // Release reservation
                    if (job.reservations && job.reservations[creep.name]) {
                        const amount = job.reservations[creep.name];
                        delete job.reservations[creep.name];
                        job.totalReserved = Math.max(0, (job.totalReserved || 0) - amount);
                    }

                    // Unassign
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

                    Debug.log(creep.room.name, 'info', `job:excess ${creep.name} unassigned from ${job.id} (${totalAssigned}>${job.maxCreepAssignments})`, {
                        type: job.type
                    });

                    delete creep.memory.jobId;
                    delete creep.memory.jobRoom;
                    delete creep.memory.haulState;
                    creep.say('🔄');
                    return;
                }
            }

            // Execute job based on type
            const jobComplete = TasksManager.executeTask(creep, job);

            // If job is complete, unassign and find new job
            if (jobComplete) {
                // Release reservation
                if (job.reservations && job.reservations[creep.name]) {
                    const amount = job.reservations[creep.name];
                    delete job.reservations[creep.name];
                    job.totalReserved = Math.max(0, (job.totalReserved || 0) - amount);
                }

                // Unassign
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

                Debug.count(creep.memory.jobRoom, 'complete');
                Debug.log(creep.memory.jobRoom, 'info', `job:complete ${job.id} by ${creep.name}`, {
                    type: job.type
                });

                delete creep.memory.jobId;
                delete creep.memory.jobRoom;
                delete creep.memory.haulState;
                creep.say('✅');
            }
        } else {
            // Creep is idle, try to find a job based on distance
            const availableJob = this.findBestJob();

            if (availableJob) {
                // For delivery jobs, reserve the energy this creep will deliver
                if (availableJob.type === 'delivery') {
                    const creepCarried = creep.store.getUsedCapacity(availableJob.resource || RESOURCE_ENERGY);
                    if (creepCarried > 0) {
                        if (!availableJob.reservations) availableJob.reservations = {};
                        availableJob.reservations[creep.name] = creepCarried;
                        availableJob.totalReserved = (availableJob.totalReserved || 0) + creepCarried;
                    }
                }

                // Assign to job
                availableJob.assignedCreepIds[creep.name] = Game.time;
                if (creep.id) {
                    availableJob.assignedObjectIds[creep.id] = creep.name;
                }
                const creepParts = creep.body.reduce((acc, part) => {
                    if (!part.hits) return acc;
                    const type = part.type.toUpperCase();
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                }, {});
                for (const partType in creepParts) {
                    const count = creepParts[partType];
                    availableJob.assignedCreepParts[partType] = (availableJob.assignedCreepParts[partType] || 0) + count;
                }

                creep.memory.jobId = availableJob.id;
                creep.memory.jobRoom = availableJob.startRoom;
                creep.say('🎯');
            } else {
                if (Debug.throttle(`idle:${creep.name}`, 25, creep.room.name)) {
                    Debug.log(creep.room.name, 'debug', `creep:idle ${creep.name}`, {
                        type: creep.memory.type
                    });
                }
                creep.say('💤');
            }
        }
    }

    findBestJob() {
        const creep = this.creep;
        const availableJobs = Memory.jobs[creep.room.name] || [];
        const possibleJobs = availableJobs.filter(job => {
            if (!job || !job.wantedCreepParts) return false;
            const hasTime = !job.minJobTime || (Game.time - (creep.memory.endOfLifeTick || 0) >= job.minJobTime);
            const isSameType = job.creepType === creep.memory.type;

            // For delivery/pickup jobs with reservations, check if we still need more capacity
            if (job.type === 'delivery' && job.freeCapacity !== undefined) {
                const totalReserved = job.totalReserved || 0;
                const stillNeeded = job.freeCapacity - totalReserved;
                return hasTime && isSameType && stillNeeded > 0;
            }

            if (job.type === 'pickup' && job.amount !== undefined) {
                const totalReserved = job.totalReserved || 0;
                const stillAvailable = job.amount - totalReserved;
                return hasTime && isSameType && stillAvailable > 0;
            }

            // For other jobs, use standard capacity and parts checking
            const hasCapacity = (job.maxCreepAssignments === undefined) ||
                (Object.keys(job.assignedCreepIds || {}).length + Object.keys(job.pendingCreepIds || {}).length < job.maxCreepAssignments);

            let anyPartUnmet = false;
            const wantedParts = job.wantedCreepParts || {};
            const assignedParts = job.assignedCreepParts || {};
            const pendingParts = job.pendingCreepParts || {};
            for (const partType in wantedParts) {
                const assigned = assignedParts[partType] || 0;
                const pending = pendingParts[partType] || 0;
                if (assigned + pending < wantedParts[partType]) {
                    anyPartUnmet = true;
                    break;
                }
            }

            return hasTime && isSameType && hasCapacity && anyPartUnmet;
        });

        if (possibleJobs.length === 0) {
            return null;
        }

        // For haulers: prioritize pickup jobs when empty, delivery jobs when carrying
        if (creep.memory.type === 'hauler') {
            const carriedEnergy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

            if (carriedEnergy > 0) {
                // Hauler has cargo - ONLY accept delivery jobs
                const deliveryJobs = possibleJobs.filter(j => j.type === 'delivery');
                if (deliveryJobs.length > 0) {
                    const room = Game.rooms[creep.room.name];

                    deliveryJobs.sort((a, b) => {
                        const priorityA = JobsManager.calculateEffectivePriority(room, a);
                        const priorityB = JobsManager.calculateEffectivePriority(room, b);
                        return priorityA - priorityB;
                    });
                    return deliveryJobs[0];
                }
                // No delivery jobs available and hauler has cargo - wait
                return null;
            } else {
                // Hauler is empty - ONLY accept pickup jobs
                const pickupJobs = possibleJobs.filter(j => j.type === 'pickup');
                if (pickupJobs.length > 0) {
                    // Calculate distance for each pickup job
                    const jobsWithDistance = pickupJobs.map(job => {
                        let distance = Infinity;

                        if (job.targetPos) {
                            distance = creep.pos.getRangeTo(job.targetPos.x, job.targetPos.y);
                        } else if (job.objectId) {
                            const target = Game.getObjectById(job.objectId);
                            if (target && target.pos) {
                                distance = creep.pos.getRangeTo(target.pos);
                            }
                        }

                        return { job, distance };
                    });

                    // Sort by priority, then distance
                    const room = creep.room;
                    jobsWithDistance.sort((a, b) => {
                        const priorityA = JobsManager.calculateEffectivePriority(room, a.job);
                        const priorityB = JobsManager.calculateEffectivePriority(room, b.job);

                        if (Math.abs(priorityA - priorityB) < 2) {
                            // Similar priority, use distance
                            return a.distance - b.distance;
                        }
                        return priorityA - priorityB;
                    });

                    return jobsWithDistance[0].job;
                }
                // No pickup jobs available and hauler is empty - wait
                return null;
            }
        }

        // Sort remaining jobs by priority
        const room = creep.room;
        possibleJobs.sort((a, b) => {
            const priorityA = JobsManager.calculateEffectivePriority(room, a);
            const priorityB = JobsManager.calculateEffectivePriority(room, b);
            return priorityA - priorityB;
        });

        return possibleJobs[0] || null;
    }
}