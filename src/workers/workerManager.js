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
                    // Delegate unassignment and reservation cleanup
                    JobsManager.unassignJobFromCreep(job, creep);

                    Debug.log(creep.room.name, 'info', `job:excess ${creep.name} unassigned from ${job.id} (${totalAssigned}>${job.maxCreepAssignments})`, {
                        type: job.type
                    });
                    creep.say('🔄');
                    return;
                }
            }

            // Execute job based on type
            const jobComplete = TasksManager.executeTask(creep, job);

            // If job is complete, unassign and find new job
            if (jobComplete) {
                // Delegate unassignment and reservation cleanup
                JobsManager.unassignJobFromCreep(job, creep);

                Debug.count(creep.memory.jobRoom, 'complete');
                Debug.log(creep.memory.jobRoom, 'info', `job:complete ${job.id} by ${creep.name}`, {
                    type: job.type
                });
                creep.say('✅');
            }
        } else {
            // Creep is idle, try to find a job based on distance
            const availableJob = this.findBestJob();

            if (availableJob) {
                // Delegate assignment and reservation bookkeeping to JobsManager
                const reserved = JobsManager.assignJobToCreep(availableJob, creep);
                if (!reserved) {
                    // Assignment couldn't reserve anything (no carried energy and no pickup available)
                    if (Debug.throttle(`assignFail:${creep.name}`, 25, creep.room.name)) {
                        Debug.log(creep.room.name, 'debug', `job:assignFailed ${creep.name} -> ${availableJob.id}`, { type: availableJob.type });
                    }
                    creep.say('⛔');
                } else {
                    creep.say('🎯');
                }
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
            if (!job) return false;
            // Allow pickup jobs even when they don't advertise wantedCreepParts (hidden prediction pickups)
            if (job.type !== 'pickup' && !job.wantedCreepParts) return false;
            const hasTime = !job.minJobTime || (Game.time - (creep.memory.endOfLifeTick || 0) >= job.minJobTime);
            const isSameType = job.creepType === creep.memory.type;

            // For delivery/pickup jobs with reservations, check if we still need more capacity
            if (job.type === 'delivery') {
                const resource = job.resource || RESOURCE_ENERGY;
                const totalReserved = job.totalReserved || 0;
                const stillNeeded = (job.freeCapacity || 0) - totalReserved;

                // If creep is carrying resource and job still needs capacity, it's assignable
                const creepCarried = creep.store.getUsedCapacity(resource);
                if (creepCarried > 0 && stillNeeded > 0) return hasTime && isSameType;

                // If the delivery exposes sources (pickup targets), check if creep can reserve some pickup
                if (job.sources && job.sources.length > 0) {
                    const creepFree = creep.store.getFreeCapacity(resource);
                    if (creepFree <= 0) return false;
                    let totalAvailable = 0;
                    for (const s of job.sources) {
                        totalAvailable += Math.max(0, (s.amount || 0) - (s.totalReserved || 0));
                    }
                    return hasTime && isSameType && totalAvailable > 0;
                }

                return false;
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
                // Hauler is empty - accept pickup opportunities. These can be hidden 'pickup' jobs
                // or delivery jobs that expose `sources` sub-targets.
                const pickupCandidates = [];

                for (const j of possibleJobs) {
                    if (j.type === 'pickup') {
                        const available = Math.max(0, (j.amount || 0) - (j.totalReserved || 0));
                        if (available <= 0) continue;
                        pickupCandidates.push({ job: j, pos: j.targetPos || null });
                        continue;
                    }

                    if (j.type === 'delivery' && j.sources && j.sources.length > 0) {
                        // For delivery jobs with sources, convert into candidates per-source
                        for (const s of j.sources) {
                            const available = Math.max(0, (s.amount || 0) - (s.totalReserved || 0));
                            if (available <= 0) continue;
                            pickupCandidates.push({ job: j, source: s, pos: s.targetPos || null });
                        }
                    }
                }

                if (pickupCandidates.length > 0) {
                    const jobsWithDistance = pickupCandidates.map(item => {
                        let distance = Infinity;
                        if (item.pos) {
                            distance = creep.pos.getRangeTo(item.pos.x, item.pos.y);
                        } else if (item.source && item.source.objectId) {
                            const target = Game.getObjectById(item.source.objectId);
                            if (target && target.pos) distance = creep.pos.getRangeTo(target.pos);
                        } else if (item.job && item.job.objectId) {
                            const target = Game.getObjectById(item.job.objectId);
                            if (target && target.pos) distance = creep.pos.getRangeTo(target.pos);
                        }
                        return { item, distance };
                    });

                    const room = creep.room;
                    jobsWithDistance.sort((a, b) => {
                        const priorityA = JobsManager.calculateEffectivePriority(room, a.item.job);
                        const priorityB = JobsManager.calculateEffectivePriority(room, b.item.job);
                        if (Math.abs(priorityA - priorityB) < 2) return a.distance - b.distance;
                        return priorityA - priorityB;
                    });

                    return jobsWithDistance[0].item.job;
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