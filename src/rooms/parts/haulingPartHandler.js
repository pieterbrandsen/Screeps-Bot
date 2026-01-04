import JobsManager from "../../jobs/jobsManager.js";
import RoomTravel from "../roomTravel.js";

export default class HaulingPartHandler {
    constructor(room, jobsRoomPartHandler) {
        this.room = room;
        this.jobsRoomPartHandler = jobsRoomPartHandler;
    }

    _findSourceContainer(source) {
        if (!source) return null;
        const containers = source.pos.findInRange(FIND_STRUCTURES, 1, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        return containers && containers.length > 0 ? containers[0] : null;
    }

    _isSourceContainer(container) {
        if (!container || !container.pos) return false;
        const sources = container.pos.findInRange(FIND_SOURCES, 1);
        return sources && sources.length > 0;
    }

    _isControllerContainer(container) {
        if (!container || !container.pos || !this.room.controller) return false;
        return container.pos.inRangeTo(this.room.controller.pos, 2);
    }

    getCongestionScore() {
        const spawns = this.room.find(FIND_MY_SPAWNS);
        if (!spawns || spawns.length === 0) return 0;

        const creeps = this.room.find(FIND_MY_CREEPS);
        let count = 0;

        for (const creep of creeps) {
            let minRange = Infinity;
            for (const spawn of spawns) {
                minRange = Math.min(minRange, creep.pos.getRangeTo(spawn.pos));
                if (minRange <= 3) break;
            }

            if (minRange <= 3) count++;
        }

        return count;
    }

    getHaulerCarryPairsEstimate() {
        // 1:1 CARRY:MOVE (no roads assumption). One pair costs 100 and carries 50.
        const energy = this.room.energyAvailable || 0;
        const pairs = Math.floor(energy / 100);

        // Keep at least 2 pairs when possible, but never exceed 16 pairs (32 part cap).
        return Math.max(1, Math.min(16, Math.max(2, pairs)));
    }

    estimateRoundTripTime(pickupPos) {
        if (!pickupPos || pickupPos.roomName !== this.room.name) return 50;
        return RoomTravel.estimateRoundTripTicks(this.room, pickupPos);
    }

    estimateOneWayTime(pickupPos) {
        if (!pickupPos || pickupPos.roomName !== this.room.name) return 25;
        return RoomTravel.estimateOneWayTicks(this.room, pickupPos);
    }

    getSoftHaulDemand(pickupPos, backlogAmount, existingJob) {
        const congestionScore = this.getCongestionScore();
        const spawns = this.room.find(FIND_MY_SPAWNS);

        const carryPairs = this.getHaulerCarryPairsEstimate();
        const carryCapacity = carryPairs * 50;

        const roundTripTime = this.estimateRoundTripTime(pickupPos);
        const backlog = Math.max(0, backlogAmount);

        const ticksToClear1 = (carryCapacity > 0)
            ? (backlog * roundTripTime) / carryCapacity
            : (backlog * roundTripTime);

        // Target horizon: clear backlog in ~2 round trips with one hauler.
        const targetHorizon = roundTripTime * 2;
        let desiredHaulers = targetHorizon > 0 ? Math.ceil(ticksToClear1 / targetHorizon) : 1;
        desiredHaulers = Math.max(1, desiredHaulers); // At least 1 hauler

        // Congestion guard: when core is crowded, clamp growth.
        const spawnCount = spawns ? spawns.length : 0;
        const hardCrowdLimit = (spawnCount * 4) + 2;
        const softCrowdLimit = Math.max(4, hardCrowdLimit - 2);

        if (congestionScore > hardCrowdLimit) {
            desiredHaulers = 1;
        } else if (congestionScore > softCrowdLimit) {
            desiredHaulers = Math.min(desiredHaulers, 2);
        }

        // Translate desired haulers into total wanted parts demand.
        const neededCarryParts = Math.ceil(backlog / 50);
        const maxCarryFromDesiredHaulers = desiredHaulers * carryPairs;
        const wantedCarryParts = Math.max(1, Math.min(neededCarryParts, maxCarryFromDesiredHaulers));

        return {
            desiredHaulers,
            wantedCarryParts,
            ticksToClear: Math.ceil(ticksToClear1),
            roundTripTime,
            carryPairs
        };
    }

    run() {
        // Clean up completed haul jobs
        this.cleanupCompletedJobs();

        // Create centralized delivery jobs
        this.createDeliveryJobs();

        // Create persistent pickup jobs per source (covers both source containers and early-game harvester transfers).
        this.createSourceHaulJobs();

        // Create pickup jobs for dropped resources (non-source drops)
        this.createDroppedResourceJobs();

        // Create pickup jobs for non-source/non-controller containers with energy (buffer containers)
        this.createContainerJobs();
    }

    cleanupCompletedJobs() {
        const pickupJobs = this.jobsRoomPartHandler.getJobsByType('pickup');

        for (const job of pickupJobs) {
            // Legacy cleanup: scheduled per-harvester haul jobs are no longer used.
            if (job.resourceType === 'harvester-drop') {
                this.deleteJob(job);
                continue;
            }

            // Persistent per-source jobs should not be auto-deleted.
            if (job.resourceType === 'source') {
                continue;
            }

            // For dropped resources and structures, we MUST have an objectId to track them
            if (job.resourceType === 'dropped' || job.resourceType === 'structure') {
                if (!job.objectId) {
                    // Missing objectId - this job is broken, delete it immediately
                    this.deleteJob(job);
                    continue;
                }

                const target = Game.getObjectById(job.objectId);

                // If it's a dropped resource, check if it still exists
                if (job.resourceType === 'dropped') {
                    if (!target || target.amount === 0) {
                        // Resource is gone, delete job
                        this.deleteJob(job);
                        continue;
                    }
                }

                // If it's a container/storage, check if it has energy
                if (job.resourceType === 'structure') {
                    if (!target || target.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                        this.deleteJob(job);
                        continue;
                    }
                }
            }

            // Check if job has been idle with no assignments for too long
            const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
            const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

            if (assignedCount === 0 && pendingCount === 0) {
                if (!job.lastUnassignedTime) {
                    job.lastUnassignedTime = Game.time;
                } else if (Game.time - job.lastUnassignedTime > 50) {
                    // Job has been idle for 50 ticks, likely not needed
                    this.deleteJob(job);
                }
            } else {
                job.lastUnassignedTime = null;
            }
        }
    }

    deleteJob(job) {
        const jobs = Memory.jobs[this.room.name];
        const index = jobs.findIndex(j => j.id === job.id);
        if (index !== -1) {
            jobs.splice(index, 1);
        }
    }

    createDeliveryJobs() {
        // Spawn-core delivery job (spawns, extensions, towers)
        const spawnCoreTargets = this.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_SPAWN ||
                s.structureType === STRUCTURE_EXTENSION ||
                s.structureType === STRUCTURE_TOWER)
                && s.store && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });

        const spawnCoreFreeCapacity = spawnCoreTargets.reduce((sum, s) =>
            sum + s.store.getFreeCapacity(RESOURCE_ENERGY), 0);

        if (spawnCoreFreeCapacity > 0) {
            const jobId = `${this.room.name}-delivery-spawn-core`;
            const existingJob = this.jobsRoomPartHandler.getJobById(jobId);

            const jobData = {
                id: jobId,
                type: 'delivery',
                deliveryTarget: 'spawn-core',
                resource: RESOURCE_ENERGY,
                creepType: 'hauler',
                startRoom: this.room.name,
                capacityType: 'fixed',
                wantedCreepParts: {},  // No spawning - only accept existing haulers
                minJobTime: 0,
                freeCapacity: spawnCoreFreeCapacity
            };

            if (!existingJob) {
                this.jobsRoomPartHandler.createJob(jobData);
            } else {
                this.jobsRoomPartHandler.updateJob(jobId, {
                    wantedCreepParts: jobData.wantedCreepParts,
                    freeCapacity: jobData.freeCapacity
                });
            }
        } else {
            // No capacity needed, delete job if exists
            const jobId = `${this.room.name}-delivery-spawn-core`;
            const existingJob = this.jobsRoomPartHandler.getJobById(jobId);
            if (existingJob) {
                this.deleteJob(existingJob);
            }
        }
    }

    createSourceHaulJobs() {
        const sources = this.room.find(FIND_SOURCES);
        if (!sources || sources.length === 0) return;

        const spawnsNeedEnergy = this.room.find(FIND_MY_SPAWNS, {
            filter: s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        }).length > 0;

        const extensionsNeedEnergy = this.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        }).length > 0;

        for (const source of sources) {
            const container = this._findSourceContainer(source);

            // If we don't have a source container yet, prefer the active harvester's tile.
            // This makes early-game harvester->hauler transfers reliable.
            let harvesterPos = null;
            let harvesterNeedsPickup = false;
            let harvesterCarried = 0;

            const maybeHarvestJob = this.jobsRoomPartHandler.getJobByObjectId(source.id);
            const harvestJob = (maybeHarvestJob && maybeHarvestJob.type === 'harvest') ? maybeHarvestJob : null;

            if (!container && harvestJob && harvestJob.assignedCreepIds) {
                for (const harvesterName in harvestJob.assignedCreepIds) {
                    const harvester = Game.creeps[harvesterName];
                    if (!harvester) continue;
                    if (!harvester.pos || harvester.pos.roomName !== this.room.name) continue;
                    if (!harvester.pos.isNearTo(source.pos)) continue;

                    harvesterPos = harvester.pos;
                    harvesterCarried = harvester.store.getUsedCapacity(RESOURCE_ENERGY);
                    const harvesterCapacity = harvester.store.getCapacity(RESOURCE_ENERGY);

                    // Create haul job proactively if harvester is 75% full or has 50+ energy
                    if (harvesterCarried >= harvesterCapacity * 0.75 || harvesterCarried >= 50) {
                        harvesterNeedsPickup = true;
                    }
                    break;
                }
            }

            const jobId = `haul-source-${source.id}`;
            const existingJob = this.jobsRoomPartHandler.getJobById(jobId);

            // Calculate actual backlog amount from container or nearby drops
            let backlogAmount = 0;
            let pickupPos = source.pos;

            if (container && container.store) {
                backlogAmount = container.store.getUsedCapacity(RESOURCE_ENERGY);
                pickupPos = container.pos;
            } else {
                // Count nearby dropped energy
                const nearbyDrops = this.room.find(FIND_DROPPED_RESOURCES, {
                    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount >= 200 && r.pos.getRangeTo(source.pos) <= 2
                });

                if (nearbyDrops.length > 0) {
                    backlogAmount = nearbyDrops.reduce((sum, r) => sum + r.amount, 0);
                    // Use harvester position if available, otherwise first drop position
                    pickupPos = harvesterPos || nearbyDrops[0].pos;
                }

                // Add harvester's carried energy if they need pickup
                if (harvesterNeedsPickup) {
                    backlogAmount += harvesterCarried;
                    if (harvesterPos) {
                        pickupPos = harvesterPos;
                    }
                }
            }

            // Only create/update job if there's actual energy to haul OR harvester needs pickup
            if (backlogAmount === 0 && !harvesterNeedsPickup) {
                // Delete job if it exists but has no energy
                if (existingJob) {
                    this.deleteJob(existingJob);
                }
                continue;
            }

            const demand = this.getSoftHaulDemand(pickupPos, backlogAmount, existingJob);

            const jobData = {
                id: jobId,
                objectId: container ? container.id : null,
                type: 'pickup',
                resourceType: 'source',
                resource: RESOURCE_ENERGY,
                creepType: 'hauler',
                startRoom: this.room.name,
                targetPos: { x: pickupPos.x, y: pickupPos.y, roomName: pickupPos.roomName },
                amount: backlogAmount,
                capacityType: 'fixed',
                maxCreepAssignments: demand.desiredHaulers,
                wantedCreepParts: { CARRY: demand.wantedCarryParts, MOVE: demand.wantedCarryParts },
                minJobTime: 0,
                ticksToClear: demand.ticksToClear,
                roundTripTime: demand.roundTripTime
            };

            if (!existingJob) {
                this.jobsRoomPartHandler.createJob(jobData);
            } else {
                this.jobsRoomPartHandler.updateJob(jobId, {
                    objectId: jobData.objectId,
                    targetPos: jobData.targetPos,
                    amount: jobData.amount,
                    maxCreepAssignments: jobData.maxCreepAssignments,
                    wantedCreepParts: jobData.wantedCreepParts,
                    ticksToClear: jobData.ticksToClear,
                    roundTripTime: jobData.roundTripTime
                });
            }
        }
    }

    createDroppedResourceJobs() {
        const droppedResources = this.room.find(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 100
        });

        for (const resource of droppedResources) {
            // Allow dropped resource jobs even near sources if amount is large enough
            // This handles cases where container is full or harvester has excess
            const nearSource = resource.pos.findInRange(FIND_SOURCES, 2).length > 0;

            // Skip small drops near sources (source job will handle them)
            // But create separate jobs for large piles (200+ energy)
            if (nearSource && resource.amount < 200) continue;

            const jobId = `haul-dropped-${resource.id}`;
            const existingJob = this.jobsRoomPartHandler.getJobById(jobId);

            const reservedAmount = existingJob ? (existingJob.totalReserved || 0) : 0;
            const availableAmount = Math.max(0, resource.amount - reservedAmount);

            // Always keep job amount in sync with the live pile
            if (existingJob) {
                this.jobsRoomPartHandler.updateJob(jobId, {
                    amount: resource.amount
                });
            }

            // If below threshold, don't create/scale a job (and remove stale ones if unreserved)
            if (availableAmount < 50) {
                if (existingJob && reservedAmount === 0) {
                    this.deleteJob(existingJob);
                }
                continue;
            }

            // Calculate needed CARRY parts based on available amount
            const demand = this.getSoftHaulDemand(resource.pos, availableAmount, existingJob);
            const maxCreepsNeeded = demand.desiredHaulers;
            const neededCarryParts = demand.wantedCarryParts;

            if (!existingJob) {
                const jobData = {
                    id: jobId,
                    objectId: resource.id,
                    type: "pickup",
                    resourceType: "dropped",
                    resource: resource.resourceType, // Specify which resource to haul
                    creepType: "hauler",
                    startRoom: this.room.name,
                    targetPos: { x: resource.pos.x, y: resource.pos.y, roomName: resource.pos.roomName },
                    amount: resource.amount,
                    capacityType: 'fixed',
                    maxCreepAssignments: maxCreepsNeeded,
                    wantedCreepParts: { CARRY: neededCarryParts, MOVE: neededCarryParts },
                    minJobTime: 0,
                    ticksToClear: demand.ticksToClear,
                    roundTripTime: demand.roundTripTime
                };
                this.jobsRoomPartHandler.createJob(jobData);
            } else {
                // Update amount and parts in case it changed
                this.jobsRoomPartHandler.updateJob(jobId, {
                    amount: resource.amount,
                    wantedCreepParts: { CARRY: neededCarryParts, MOVE: neededCarryParts },
                    maxCreepAssignments: maxCreepsNeeded,
                    ticksToClear: demand.ticksToClear,
                    roundTripTime: demand.roundTripTime
                });
            }
        }
    }

    createContainerJobs() {
        const containers = this.room.find(FIND_STRUCTURES, {
            filter: s => (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE)
                && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });

        for (const container of containers) {
            // Source jobs handle source containers; delivery logic handles controller container.
            if (container.structureType === STRUCTURE_CONTAINER) {
                if (this._isSourceContainer(container)) continue;
                if (this._isControllerContainer(container)) continue;
            }

            const jobId = `haul-container-${container.id}`;
            const existingJob = this.jobsRoomPartHandler.getJobById(jobId);

            const amount = container.store.getUsedCapacity(RESOURCE_ENERGY);

            const reservedAmount = existingJob ? (existingJob.totalReserved || 0) : 0;
            const availableAmount = Math.max(0, amount - reservedAmount);

            // Always keep job amount in sync with the live container
            if (existingJob) {
                this.jobsRoomPartHandler.updateJob(jobId, {
                    amount: amount
                });
            }

            // If core needs energy, start hauling sooner (source containers fill slowly early-game).
            const spawnsNeedEnergy = this.room.find(FIND_MY_SPAWNS, {
                filter: s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            }).length > 0;

            const extensionsNeedEnergy = this.room.find(FIND_MY_STRUCTURES, {
                filter: s => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
            }).length > 0;

            const minThreshold = (spawnsNeedEnergy || extensionsNeedEnergy) ? 25 : 100;

            // Skip if all energy is reserved or below threshold
            if (availableAmount < minThreshold) {
                if (existingJob && reservedAmount === 0) {
                    this.deleteJob(existingJob);
                }
                continue;
            }

            // Calculate needed CARRY parts based on available amount
            const demand = this.getSoftHaulDemand(container.pos, availableAmount, existingJob);
            const maxCreepsNeeded = demand.desiredHaulers;
            const neededCarryParts = demand.wantedCarryParts;

            if (!existingJob) {
                const jobData = {
                    id: jobId,
                    objectId: container.id,
                    type: "pickup",
                    resourceType: "structure",
                    resource: RESOURCE_ENERGY, // Specify which resource to haul (can be changed for other resources)
                    creepType: "hauler",
                    startRoom: this.room.name,
                    targetPos: { x: container.pos.x, y: container.pos.y, roomName: container.pos.roomName },
                    amount: amount,
                    capacityType: 'fixed',
                    maxCreepAssignments: maxCreepsNeeded,
                    wantedCreepParts: { CARRY: neededCarryParts, MOVE: neededCarryParts },
                    minJobTime: 0,
                    ticksToClear: demand.ticksToClear,
                    roundTripTime: demand.roundTripTime
                };
                this.jobsRoomPartHandler.createJob(jobData);
            } else {
                // Update amount and parts based on current container contents
                this.jobsRoomPartHandler.updateJob(jobId, {
                    amount: amount,
                    wantedCreepParts: { CARRY: neededCarryParts, MOVE: neededCarryParts },
                    maxCreepAssignments: maxCreepsNeeded,
                    ticksToClear: demand.ticksToClear,
                    roundTripTime: demand.roundTripTime
                });
            }
        }
    }
}

