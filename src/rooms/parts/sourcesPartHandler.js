import JobsManager from "../../jobs/jobsManager.js";
import Constants from '../../utils/constants.js';

export default class SourcesPartHandler {
    constructor(source, room, jobsRoomPartHandler) {
        this.source = source;
        this.room = room;
        this.jobsRoomPartHandler = jobsRoomPartHandler;
    }

    countHarvestSpots() {
        const terrain = this.room.getTerrain();
        let spots = 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                const x = this.source.pos.x + dx;
                const y = this.source.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;

                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

                // Roads and containers are walkable; ramparts are walkable only if owned/public.
                const structures = this.room.lookForAt(LOOK_STRUCTURES, x, y);
                let blocked = false;
                for (const s of structures) {
                    if (s.structureType === STRUCTURE_ROAD) continue;
                    if (s.structureType === STRUCTURE_CONTAINER) continue;
                    if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;
                    blocked = true;
                    break;
                }

                if (!blocked) spots++;
            }
        }

        return spots;
    }

    getJob() {
        return this.jobsRoomPartHandler.getJobByObjectId(this.source.id);
    }

    createOrUpdateJob(job) {
        const ticksToRegeneration = this.source.ticksToRegeneration || ENERGY_REGEN_TIME;
        const energyPerTick = this.source.energyCapacity / ticksToRegeneration;
        const desiredWorkParts = Math.ceil(energyPerTick / HARVEST_POWER);
        const wantedCreepParts = { WORK: desiredWorkParts };

        let maxCreepAssignments = undefined;

        if (job) {
            maxCreepAssignments = job.maxCreepAssignments || 1;
            const missingWantedParts = JobParts.getMissingWantedParts(
                job.wantedCreepParts,
                job.assignedCreepParts,
                job.pendingCreepParts
            );
            const missingWorkParts = missingWantedParts.WORK || 0;
            if (missingWorkParts <= 0) {
                maxCreepAssignments = Object.keys(job.assignedCreepIds).length;

            }
        }

        if (maxCreepAssignments === undefined) {
            const harvestSpots = this.countHarvestSpots();
            maxCreepAssignments = Math.min(maxCreepAssignments, harvestSpots);
        }

        if (!job) {
            const jobData = {
                id: `${this.source.id}-harvest-job`,
                objectId: this.source.id,
                type: "harvest",
                creepType: "harvester",
                startRoom: this.room.name,
                energyPerTick,
                ticksToRegeneration,
                capacityType: 'fixed',
                maxCreepAssignments,
                wantedCreepParts,
                minJobTime: 100,
            };
            this.jobsRoomPartHandler.createJob(jobData);
        } else {
            this.jobsRoomPartHandler.updateJob(job.id, {
                energyPerTick,
                ticksToRegeneration,
                maxCreepAssignments,
                wantedCreepParts
            });
        }
    }

    run() {
        const job = this.getJob();
        this.createOrUpdateJob(job);
        // Logic for handling sources parts goes here
    }
}
