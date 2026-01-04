import JobsManager from "../../jobs/jobsManager.js";
import Constants from '../../utils/constants.js';
import RoomUtils from "../../utils/roomUtils.js";

export default class BuildingPartHandler {
    constructor(room, jobsRoomPartHandler) {
        this.room = room;
        this.jobsRoomPartHandler = jobsRoomPartHandler;
    }

    _getBuildPlanMemory() {
        if (!this.room.memory) this.room.memory = {};
        if (!this.room.memory.buildPlan) this.room.memory.buildPlan = {};
        const mem = this.room.memory.buildPlan;
        if (!mem.cooldowns) mem.cooldowns = {};
        if (!mem.cooldowns.sourceContainers) mem.cooldowns.sourceContainers = {};
        return mem;
    }

    _isFreeForConstruction(x, y) {
        if (!RoomUtils.isWalkableTile(this.room, x, y)) return false;
        // Can't place a site on top of another site.
        const sites = this.room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
        if (sites && sites.length > 0) return false;
        return true;
    }

    _tryCreateSite(x, y, structureType, opts = {}) {
        const { cooldownKey, cooldownTicks = 50 } = opts;
        const mem = this._getBuildPlanMemory();

        const result = this.room.createConstructionSite(x, y, structureType);
        if (result === OK) {
            mem.lastPlacedTick = Game.time;
            mem.lastPlaced = { x, y, structureType };
            return true;
        }

        // Avoid re-trying hopeless placements every tick.
        if (cooldownKey) {
            mem.cooldowns[cooldownKey] = Game.time + cooldownTicks;
        }

        return false;
    }

    _roomPlaceThrottleActive() {
        const mem = this._getBuildPlanMemory();
        if (mem.lastPlacedTick === Game.time) return true;
        if (mem.cooldowns && mem.cooldowns.globalUntilTick && Game.time < mem.cooldowns.globalUntilTick) return true;
        return false;
    }

    _setGlobalCooldown(ticks) {
        const mem = this._getBuildPlanMemory();
        mem.cooldowns.globalUntilTick = Game.time + Math.max(1, ticks || 1);
    }

    _tryPlaceSourceContainerSites() {
        const mem = this._getBuildPlanMemory();
        const sources = this.room.find(FIND_SOURCES);
        const spawns = this.room.find(FIND_MY_SPAWNS);
        const spawnPos = spawns.length > 0 ? spawns[0].pos : null;

        for (const source of sources) {
            const until = mem.cooldowns.sourceContainers[source.id] || 0;
            if (Game.time < until) continue;

            // Already have (or are building) a container next to this source.
            const nearbyContainers = source.pos.findInRange(FIND_STRUCTURES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            if (nearbyContainers.length > 0) continue;

            const nearbyContainerSites = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });
            if (nearbyContainerSites.length > 0) continue;

            let best = null;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const x = source.pos.x + dx;
                    const y = source.pos.y + dy;
                    if (!this._isFreeForConstruction(x, y)) continue;

                    // Prefer tiles with more adjacent open tiles (more maneuvering room).
                    let score = RoomUtils.countAdjacentOpenTiles(this.room, x, y);
                    // Tie-breaker: slightly prefer closer to spawn.
                    if (spawnPos) {
                        score -= spawnPos.getRangeTo(x, y) * 0.01;
                    }

                    if (!best || score > best.score) {
                        best = { x, y, score };
                    }
                }
            }

            if (!best) {
                mem.cooldowns.sourceContainers[source.id] = Game.time + 200;
                continue;
            }

            const result = this.room.createConstructionSite(best.x, best.y, STRUCTURE_CONTAINER);
            if (result === OK) {
                mem.lastPlacedTick = Game.time;
                mem.lastPlaced = { x: best.x, y: best.y, structureType: STRUCTURE_CONTAINER, sourceId: source.id };
                return true;
            }

            if (result === ERR_FULL) {
                this._setGlobalCooldown(25);
                return false;
            }
            if (result === ERR_RCL_NOT_ENOUGH) {
                mem.cooldowns.sourceContainers[source.id] = Game.time + 500;
                continue;
            }

            mem.cooldowns.sourceContainers[source.id] = Game.time + 100;
        }

        return false;
    }

    _tryPlaceControllerContainerSite() {
        const mem = this._getBuildPlanMemory();
        if (!this.room.controller || !this.room.controller.my) return false;

        const controller = this.room.controller;

        // Already have (or are building) a controller container.
        const existing = controller.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        if (existing.length > 0) return false;

        const existingSites = controller.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        if (existingSites.length > 0) return false;

        const until = mem.cooldowns.controllerContainerUntilTick || 0;
        if (Game.time < until) return false;

        // We prefer placing the container at range 2 from the controller.
        // That way upgraders can stand on all 8 adjacent tiles, while still being within range 3 to upgrade.
        const spawns = this.room.find(FIND_MY_SPAWNS);
        const spawnPos = spawns.length > 0 ? spawns[0].pos : null;

        let best8 = null;
        let bestAny = null;
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const d = Math.max(Math.abs(dx), Math.abs(dy));
                if (d !== 2) continue;

                const x = controller.pos.x + dx;
                const y = controller.pos.y + dy;
                if (!this._isFreeForConstruction(x, y)) continue;

                const openAdj = RoomUtils.countAdjacentOpenTiles(this.room, x, y);
                // Slight tie-break toward spawn.
                let score = openAdj;
                if (spawnPos) score -= spawnPos.getRangeTo(x, y) * 0.01;

                const candidate = { x, y, openAdj, score };
                if (!bestAny || candidate.score > bestAny.score) bestAny = candidate;
                if (openAdj >= 8 && (!best8 || candidate.score > best8.score)) best8 = candidate;
            }
        }

        const chosen = best8 || bestAny;
        if (!chosen) {
            mem.cooldowns.controllerContainerUntilTick = Game.time + 200;
            return false;
        }

        // Try to honor the "8 spots" intent; if the room can't support it, back off and retry later.
        if (!best8 && chosen.openAdj < 8) {
            mem.cooldowns.controllerContainerUntilTick = Game.time + 500;
            return false;
        }

        const result = this.room.createConstructionSite(chosen.x, chosen.y, STRUCTURE_CONTAINER);
        if (result === OK) {
            mem.lastPlacedTick = Game.time;
            mem.lastPlaced = { x: chosen.x, y: chosen.y, structureType: STRUCTURE_CONTAINER, controller: true };
            return true;
        }

        if (result === ERR_FULL) {
            this._setGlobalCooldown(25);
            return false;
        }
        if (result === ERR_RCL_NOT_ENOUGH) {
            mem.cooldowns.controllerContainerUntilTick = Game.time + 500;
            return false;
        }

        mem.cooldowns.controllerContainerUntilTick = Game.time + 100;
        return false;
    }

    _tryPlaceExtensionSites() {
        const mem = this._getBuildPlanMemory();
        if (!this.room.controller || !this.room.controller.my) return false;

        // Controller structure limits.
        const rcl = this.room.controller.level || 0;
        const limit = (typeof CONTROLLER_STRUCTURES !== 'undefined' && CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION])
            ? (CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl] || 0)
            : 0;
        if (limit <= 0) return false;

        const existing = this.room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        }).length;
        const sites = this.room.find(FIND_MY_CONSTRUCTION_SITES, {
            filter: s => s.structureType === STRUCTURE_EXTENSION
        }).length;
        if (existing + sites >= limit) return false;

        const spawns = this.room.find(FIND_MY_SPAWNS);
        if (spawns.length === 0) return false;
        const spawn = spawns[0];

        const extensionCooldownUntil = mem.cooldowns.extensionsUntilTick || 0;
        if (Game.time < extensionCooldownUntil) return false;

        // Scan outward in rings from the spawn. Keep it small to stay cheap.
        const maxR = 6;
        for (let r = 2; r <= maxR; r++) {
            let best = null;
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    const d = Math.max(Math.abs(dx), Math.abs(dy));
                    if (d !== r) continue;

                    const x = spawn.pos.x + dx;
                    const y = spawn.pos.y + dy;
                    if (!this._isFreeForConstruction(x, y)) continue;

                    // Prefer open space; slightly deprioritize road tiles.
                    let score = RoomUtils.countAdjacentOpenTiles(this.room, x, y);
                    const structures = this.room.lookForAt(LOOK_STRUCTURES, x, y);
                    if (structures.some(s => s.structureType === STRUCTURE_ROAD)) score -= 1;

                    if (!best || score > best.score) best = { x, y, score };
                }
            }

            if (best) {
                const result = this.room.createConstructionSite(best.x, best.y, STRUCTURE_EXTENSION);
                if (result === OK) {
                    mem.lastPlacedTick = Game.time;
                    mem.lastPlaced = { x: best.x, y: best.y, structureType: STRUCTURE_EXTENSION };
                    return true;
                }
                if (result === ERR_FULL) {
                    this._setGlobalCooldown(25);
                    return false;
                }
                if (result === ERR_RCL_NOT_ENOUGH) {
                    mem.cooldowns.extensionsUntilTick = Game.time + 500;
                    return false;
                }

                mem.cooldowns.extensionsUntilTick = Game.time + 50;
                return false;
            }
        }

        // No open tile found near spawn, back off.
        mem.cooldowns.extensionsUntilTick = Game.time + 200;
        return false;
    }



    _getPriorityForStructureType(structureType) {
        // Lower number = higher priority
        const priorities = {
            [STRUCTURE_SPAWN]: 1,
            [STRUCTURE_TOWER]: 2,
            [STRUCTURE_EXTENSION]: 3,
            [STRUCTURE_CONTAINER]: 4,
            [STRUCTURE_STORAGE]: 5,
            [STRUCTURE_LINK]: 6,
            [STRUCTURE_ROAD]: 8,
            [STRUCTURE_RAMPART]: 9,
            [STRUCTURE_WALL]: 10
        };
        return priorities[structureType] || 7; // Default priority
    }

    _calculateWorkPartsForSite(site, energyState) {
        // Base calculation: energy per tick
        // Each WORK part builds 5 energy per tick
        let desiredEnergyPerTick = Constants.BUILD_ENERGY_PER_TICK_BASE;

        // Apply energy state
        if (energyState === 'abundant') desiredEnergyPerTick = Constants.BUILD_ENERGY_PER_TICK_ABUNDANT;
        else if (energyState === 'normal') desiredEnergyPerTick = Constants.BUILD_ENERGY_PER_TICK_NORMAL;
        else if (energyState === 'tight') desiredEnergyPerTick = Constants.BUILD_ENERGY_PER_TICK_TIGHT;
        else if (energyState === 'startup') desiredEnergyPerTick = Constants.BUILD_ENERGY_PER_TICK_STARTUP;

        // Convert energy per tick to WORK parts (each WORK = 5 energy/tick)
        let desiredWorkParts = Math.ceil(desiredEnergyPerTick / 5);

        // Clamp to reasonable bounds
        return Math.max(1, Math.min(15, desiredWorkParts));
    }

    createOrUpdateJobs() {
        const constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
        const existingBuildJobs = this.jobsRoomPartHandler.getJobsByType('build');
        const energyState = this.jobsRoomPartHandler.getEnergyState();

        // Track which construction sites have jobs
        const siteIds = new Set(constructionSites.map(s => s.id));

        // Remove jobs for completed/destroyed construction sites
        for (const job of existingBuildJobs) {
            if (job.objectId && !siteIds.has(job.objectId)) {
                this.jobsRoomPartHandler.deleteJob(job.id);
            }
        }

        // Create or update jobs for each construction site
        for (const site of constructionSites) {
            const jobId = `build-${site.id}`;
            const existingJob = this.jobsRoomPartHandler.getJobById(jobId);

            const wantedWorkParts = this._calculateWorkPartsForSite(site, energyState);

            const jobData = {
                id: jobId,
                objectId: site.id,
                type: 'build',
                creepType: 'worker',
                startRoom: this.room.name,
                capacityType: 'fixed',
                maxCreepAssignments: Math.max(1, Math.ceil(wantedWorkParts / 5)), // Max workers based on work needed
                wantedCreepParts: {
                    WORK: wantedWorkParts,
                    CARRY: wantedWorkParts,
                    MOVE: wantedWorkParts
                },
                minJobTime: 50
            };

            if (!existingJob) {
                this.jobsRoomPartHandler.createJob(jobData);
            } else {
                this.jobsRoomPartHandler.updateJob(jobId, {
                    maxCreepAssignments: jobData.maxCreepAssignments,
                    wantedCreepParts: jobData.wantedCreepParts
                });
            }
        }
    }

    run() {
        if (!this.room) return;

        // Place at most one site per room per tick.
        if (!this._roomPlaceThrottleActive()) {
            // Place source containers first (helps harvesting/hauling), then controller container, then extensions.
            const placed = this._tryPlaceSourceContainerSites()
                || this._tryPlaceControllerContainerSite()
                || this._tryPlaceExtensionSites();
            if (placed) {
                // If we placed something, constructionSites will exist and jobs will be created below.
            }
        }

        // Create individual jobs for each construction site
        this.createOrUpdateJobs();
    }
}

