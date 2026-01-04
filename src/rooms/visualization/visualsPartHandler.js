import JobsManager from "../../jobs/jobsManager.js";
import Constants from "../../utils/constants.js";
import RoomUtils from "../../utils/roomUtils.js";
import Debug from "../../debug/debug.js";

export default class VisualsPartHandler {
    constructor(room, jobsRoomPartHandler, predictingRoomPartHandler) {
        this.room = room;
        this.jobsRoomPartHandler = jobsRoomPartHandler;
        this.predictingRoomPartHandler = predictingRoomPartHandler;
    }

    run() {
        this._forecastHorizon = 500;
        // Get actual spawn queue from memory (what's actually being spawned)
        this._actualSpawnQueue = this.room.memory.spawnQueue || [];
        // Get forecast queue (future replacements)
        this._forecastQueue = this.predictingRoomPartHandler.buildSpawnQueue(this._forecastHorizon);
        // Combine for full picture
        this._spawnQueue = this._actualSpawnQueue.length > 0 ? this._actualSpawnQueue : this._forecastQueue;

        // Core HUD elements (top section)
        this.drawOverviewHUD();              // Top left
        this.drawSpawnQueueDetailed();       // Middle
        this.drawEnergyPrediction();         // Top right - Energy forecast

        // Job visualizations
        this.drawJobList();                  // Text list of jobs with assignments
        this.drawJobLocationVisuals();       // Draws at job locations
        this.drawJobMarkers();               // Job markers on map
    }

    _hudText(text, x, y, opts = {}) {
        this.room.visual.text(text, x, y, {
            align: opts.align || 'left',
            font: opts.font || 0.45,
            color: opts.color || '#ffffff',
            stroke: opts.stroke || '#000000',
            strokeWidth: opts.strokeWidth === undefined ? 0.05 : opts.strokeWidth
        });
    }

    _hudHeader(text, x, y) {
        this._hudText(text, x, y, { font: 0.55, color: '#00ffff' });
    }

    _countCreepParts(partsObj) {
        const w = Math.floor((partsObj && partsObj.WORK) || 0);
        const c = Math.floor((partsObj && partsObj.CARRY) || 0);
        const m = Math.floor((partsObj && partsObj.MOVE) || 0);
        return { w, c, m };
    }

    _getJobIcon(type) {
        return Constants.getJobIcon(type);
    }

    _getEnergySummary() {
        const energyState = this.jobsRoomPartHandler.getEnergyState();
        const energy = this.room.energyAvailable || 0;
        const capacity = this.room.energyCapacityAvailable || 0;
        const fill = capacity > 0 ? (energy / capacity) : 0;
        const fillPct = Math.floor(fill * 100);

        const storage = this.room.storage;
        const storedEnergy = storage ? (storage.store[RESOURCE_ENERGY] || 0) : null;
        const bootstrap = this.jobsRoomPartHandler.isEmergencyBootstrap();

        return { energyState, energy, capacity, fill, fillPct, storedEnergy, bootstrap };
    }

    drawOverviewHUD() {
        const x = 1;
        let y = 1;
        const w = 47;
        const h = 8.5;

        // Background
        this.room.visual.rect(x - 0.5, y - 0.6, w, h, { fill: '#000000', opacity: 0.25 });

        this._hudText(`📌 OVERVIEW ${this.room.name}  t:${Game.time}`, x, y, { font: 0.6, color: '#ffffff' });
        y += 0.9;

        // Layout: two columns
        const leftX = x;
        const rightX = 25;
        let leftY = y;
        let rightY = y;

        // ENERGY
        const es = this._getEnergySummary();
        this._hudHeader('⚡ ENERGY', leftX, leftY);
        leftY += 0.6;
        this._hudText(`State: ${String(es.energyState).toUpperCase()}`, leftX, leftY, {
            color: es.energyState === 'startup' ? '#ffaaaa' : (es.energyState === 'tight' ? '#ffffaa' : '#aaffaa')
        });
        leftY += 0.5;
        this._hudText(`Available: ${es.energy}/${es.capacity} (${es.fillPct}%)`, leftX, leftY, { color: '#cccccc' });
        leftY += 0.5;
        if (es.storedEnergy !== null) {
            this._hudText(`Storage: ${es.storedEnergy}`, leftX, leftY, { color: '#cccccc' });
            leftY += 0.5;
        }
        if (es.energyState === 'startup') {
            this._hudText(`Bootstrap: ${es.bootstrap ? 'ON' : 'off'}`, leftX, leftY, { color: es.bootstrap ? '#ffaaaa' : '#888888' });
            leftY += 0.5;
        }

        // CREEPS
        const creeps = this.room.find(FIND_MY_CREEPS);
        let idle = 0;
        const byType = Object.create(null);
        for (const c of creeps) {
            const t = (c.memory && c.memory.type) ? c.memory.type : 'unknown';
            byType[t] = (byType[t] || 0) + 1;
            if (!c.memory || !c.memory.jobId) idle++;
        }

        leftY += 0.2;
        this._hudHeader('👥 CREEPS', leftX, leftY);
        leftY += 0.6;
        const typeParts = [];
        for (const t in byType) typeParts.push(`${t}:${byType[t]}`);
        this._hudText(`Total: ${creeps.length}  Idle: ${idle}`, leftX, leftY, { color: '#cccccc' });
        leftY += 0.5;
        if (typeParts.length > 0) {
            this._hudText(`By type: ${typeParts.join(' ')}`, leftX, leftY, { color: '#888888', font: 0.4 });
            leftY += 0.45;
        }
    }

    drawSpawnQueueDetailed() {
        const x = 22;
        let y = 10;
        const actualQueue = this.room.memory.spawnQueue || [];

        // Calculate background height based on actual content
        let bgHeight = 0.7; // Header
        if (actualQueue.length === 0) {
            bgHeight += 0.5; // "(empty)" text
        } else {
            bgHeight += 0.6; // "Total: X queued" text
            const displayCount = Math.min(actualQueue.length, 10);
            for (let i = 0; i < displayCount; i++) {
                const item = actualQueue[i];
                bgHeight += 0.5; // Main line
                if (item.targetTick) {
                    bgHeight += 0.45; // Detail line
                }
            }
            if (actualQueue.length > 10) {
                bgHeight += 0.5; // Overflow text
            }
        }
        this.room.visual.rect(x - 0.5, y - 0.6, 20, bgHeight + 0.5, { fill: '#000000', opacity: 0.3 });

        this._hudHeader('📅 SPAWN QUEUE', x, y);
        y += 0.7;

        if (actualQueue.length === 0) {
            this._hudText('(empty)', x, y, { color: '#888888' });
            return;
        }

        this._hudText(`Total: ${actualQueue.length} queued`, x, y, { color: '#aaffaa' });
        y += 0.6;

        for (let i = 0; i < Math.min(actualQueue.length, 10); i++) {
            const item = actualQueue[i];
            const icon = this._getJobIcon(item.jobType);
            const canAfford = this.room.energyAvailable >= item.cost;

            // Status indicator
            let statusIcon = '○';
            let statusColor = '#ffffff';
            if (i === 0) {
                statusIcon = canAfford ? '▶' : '⏸';
                statusColor = canAfford ? '#00ff00' : '#ffffaa';
            }

            // Body composition
            const parts = item.parts || {};
            const w = parts.WORK || 0;
            const c = parts.CARRY || 0;
            const m = parts.MOVE || 0;
            const partsText = `W${w} C${c} M${m}`;

            // Target tick
            const targetText = item.targetTick ? ` @${item.targetTick}t` : '';

            // Main line
            const line1 = `${statusIcon} ${icon} ${item.jobType} ${item.cost}E ${partsText}`;
            this._hudText(line1, x, y, { color: statusColor });
            y += 0.5;

            // Detail line
            if (item.targetTick) {
                const details = [];
                if (item.targetTick) details.push(targetText);
                this._hudText(`  ${details.join(' ')}`, x, y, { color: '#888888', font: 0.35 });
                y += 0.45;
            }
        }

        if (actualQueue.length > 10) {
            this._hudText(`...and ${actualQueue.length - 10} more`, x, y, { color: '#888888', font: 0.4 });
        }
    }

    _getControllerContainer() {
        const controller = this.room.controller;
        if (!controller) return null;
        const containers = controller.pos.findInRange(FIND_STRUCTURES, 3, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        if (!containers || containers.length === 0) return null;

        // Prefer the container closest to the controller (usually range 2).
        let best = containers[0];
        let bestRange = controller.pos.getRangeTo(best);
        for (let i = 1; i < containers.length; i++) {
            const c = containers[i];
            const r = controller.pos.getRangeTo(c);
            if (r < bestRange) {
                best = c;
                bestRange = r;
            }
        }
        return best;
    }

    _getAdjacentSpotsAround(pos) {
        return RoomUtils.getAdjacentPositions(pos).filter(p =>
            RoomUtils.isWalkableTile(this.room, p.x, p.y)
        );
    }

    _pickReservedSpotClosestToSpawn(spots) {
        if (!spots || spots.length === 0) return null;
        const spawns = this.room.find(FIND_MY_SPAWNS);
        if (!spawns || spawns.length === 0) return spots[0];
        const spawnPos = spawns[0].pos;

        let best = spots[0];
        let bestRange = spawnPos.getRangeTo(best);
        for (let i = 1; i < spots.length; i++) {
            const s = spots[i];
            const r = spawnPos.getRangeTo(s);
            if (r < bestRange) {
                best = s;
                bestRange = r;
            }
        }
        return best;
    }

    drawDebugHUD() {
        if (!Debug.isHudEnabled(this.room.name)) return;

        const x = 35;
        const y = 9;
        const w = 12;
        const h = 5.5;

        const eff = Debug.getEffectiveLevel(this.room.name);
        const counts = Debug.getCounts(this.room.name);

        const creeps = this.room.find(FIND_MY_CREEPS);
        let idle = 0;
        const byType = Object.create(null);
        for (const c of creeps) {
            const type = (c.memory && c.memory.type) ? c.memory.type : 'unknown';
            byType[type] = (byType[type] || 0) + 1;
            if (!c.memory || !c.memory.jobId) idle++;
        }

        const jobs = this.jobsRoomPartHandler.getJobsForRoom();
        const uncovered = jobs.filter(j => {
            const assigned = Object.keys(j.assignedCreepIds || {}).length;
            const pending = Object.keys(j.pendingCreepIds || {}).length;
            return assigned + pending === 0 && j.wantedCreepParts && Object.keys(j.wantedCreepParts).length > 0;
        });

        uncovered.sort((a, b) => {
            const pa = JobsManager.calculateEffectivePriority(this.room, a);
            const pb = JobsManager.calculateEffectivePriority(this.room, b);
            return pa - pb;
        });

        const spawns = this.room.find(FIND_MY_SPAWNS);
        const spawning = spawns.filter(s => s.spawning);

        this.room.visual.rect(x, y, w, h, { fill: '#000000', opacity: 0.35 });
        this.room.visual.text('🛠 Debug HUD', x, y + 0.5, {
            align: 'left',
            font: 0.6,
            color: '#ffffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        this.room.visual.text(`Tick: ${Game.time}  Log: ${eff.name}`, x, y + 1.2, {
            align: 'left',
            font: 0.45,
            color: eff.value > 0 ? '#00ffff' : '#888888',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        const typeParts = [];
        for (const t in byType) typeParts.push(`${t}:${byType[t]}`);

        this.room.visual.text(`Creeps: ${creeps.length}  Idle: ${idle}  ${typeParts.join(' ')}`, x, y + 1.9, {
            align: 'left',
            font: 0.4,
            color: '#cccccc',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        this.room.visual.text(`Jobs: ${jobs.length}  Uncovered: ${uncovered.length}`, x, y + 2.5, {
            align: 'left',
            font: 0.4,
            color: uncovered.length > 0 ? '#ffaaaa' : '#aaffaa',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        const eventsLine = `Evt: a+${counts.assign || 0} a-${counts.unassign || 0} done:${counts.complete || 0} spawn:${counts.spawn || 0} mvBlk:${counts.moveBlocked || 0}`;
        this.room.visual.text(eventsLine, x, y + 3.1, {
            align: 'left',
            font: 0.35,
            color: '#888888',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        let lineY = y + 3.8;
        if (spawning.length > 0) {
            const s = spawning[0];
            this.room.visual.text(`Spawn: ${s.name} ${s.spawning.remainingTime}t`, x, lineY, {
                align: 'left',
                font: 0.35,
                color: '#aaffaa',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            lineY += 0.55;
        } else {
            this.room.visual.text(`Spawn: idle`, x, lineY, {
                align: 'left',
                font: 0.35,
                color: '#888888',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            lineY += 0.55;
        }

        // Top uncovered jobs (why work isn't happening)
        const limit = Math.min(3, uncovered.length);
        for (let i = 0; i < limit; i++) {
            const j = uncovered[i];
            const p = JobsManager.calculateEffectivePriority(this.room, j);
            this.room.visual.text(`! P${p} ${j.type} ${j.id}`, x, lineY, {
                align: 'left',
                font: 0.33,
                color: '#ff8888',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            lineY += 0.5;
        }
    }

    drawAssignmentCoverage() {
        // Graph: how many jobs have 0 assigned+pending now, and when planned spawns will cover them
        const horizon = this._forecastHorizon || 500;
        const jobs = this.jobsRoomPartHandler.getJobsForRoom()
            .filter(j => j.wantedCreepParts && Object.keys(j.wantedCreepParts).some(k => j.wantedCreepParts[k] > 0));

        if (jobs.length === 0) return;

        const spawnQueue = this._spawnQueue || [];

        // Determine the first time each job will be covered by a planned spawn (spawnTick is completion)
        const firstCoverTickByJob = new Map();
        for (const planned of spawnQueue) {
            const jobId = planned.job && planned.job.id;
            if (!jobId) continue;
            const prev = firstCoverTickByJob.get(jobId);
            if (prev === undefined || planned.spawnTick < prev) {
                firstCoverTickByJob.set(jobId, planned.spawnTick);
            }
        }

        // Build uncovered intervals per job, factoring in creep death.
        const intervals = [];
        const horizonEnd = Game.time + horizon;

        for (const job of jobs) {
            const assignedNames = Object.keys(job.assignedCreepIds || {});
            const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

            let coveredUntil = null;
            if (pendingCount > 0) {
                // Assume pending creeps will spawn soon enough to avoid showing gaps.
                coveredUntil = horizonEnd;
            } else if (assignedNames.length > 0) {
                let lastDeath = Game.time;
                for (const creepName of assignedNames) {
                    const creep = Game.creeps[creepName];
                    if (creep && creep.ticksToLive !== undefined && creep.ticksToLive !== null) {
                        lastDeath = Math.max(lastDeath, Game.time + creep.ticksToLive);
                    }
                }
                coveredUntil = lastDeath;
            } else {
                coveredUntil = Game.time;
            }

            const plannedCoverTick = firstCoverTickByJob.get(job.id) || Infinity;

            // If no assigned/pending, job is uncovered until its first planned cover.
            if (assignedNames.length === 0 && pendingCount === 0) {
                const start = Game.time;
                const end = Math.min(horizonEnd, plannedCoverTick);
                if (end > start) intervals.push({ start, end });
                continue;
            }

            // If current coverage ends before the planned cover arrives, show a gap.
            if (coveredUntil < plannedCoverTick) {
                const start = Math.max(Game.time, coveredUntil);
                const end = Math.min(horizonEnd, plannedCoverTick);
                if (end > start) intervals.push({ start, end });
            }
        }

        const graphX = 35;
        const graphY = 5.2;
        const graphWidth = 12;
        const graphHeight = 2.5;

        this.room.visual.text('👥 Job Coverage', graphX, graphY, {
            align: 'left',
            font: 0.6,
            color: '#00ffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        this.room.visual.rect(graphX, graphY + 0.5, graphWidth, graphHeight, {
            fill: '#000000',
            opacity: 0.3
        });

        // Sample the horizon into a small number of points
        const points = 30;
        const step = Math.floor(horizon / points);

        // Count uncovered jobs at a given tick using the intervals
        const countUncoveredAt = (t) => {
            let count = 0;
            for (const it of intervals) {
                if (t >= it.start && t < it.end) count++;
            }
            return count;
        };

        const nowUncovered = countUncoveredAt(Game.time);
        const maxUncovered = Math.max(1, nowUncovered);

        // Line: uncovered jobs remaining over time
        for (let i = 0; i < points - 1; i++) {
            const t1 = Game.time + (i * step);
            const t2 = Game.time + ((i + 1) * step);

            const u1 = countUncoveredAt(t1);
            const u2 = countUncoveredAt(t2);

            const x1 = graphX + (i / points) * graphWidth;
            const x2 = graphX + ((i + 1) / points) * graphWidth;

            const y1 = graphY + graphHeight + 0.5 - (u1 / maxUncovered) * graphHeight;
            const y2 = graphY + graphHeight + 0.5 - (u2 / maxUncovered) * graphHeight;

            this.room.visual.line(x1, y1, x2, y2, {
                color: '#00ffff',
                width: 0.05,
                opacity: 0.8
            });
        }

        // Label current uncovered
        this.room.visual.text(`Now: ${nowUncovered} uncovered`, graphX, graphY + graphHeight + 1.0, {
            align: 'left',
            font: 0.4,
            color: '#888888'
        });
    }

    drawJobStats() {
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();
        let y = 11;

        this.room.visual.text(`📋 Jobs: ${jobs.length}`, 1, y, {
            align: 'left',
            font: 0.6,
            color: '#ffffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        y += 0.8;

        for (const job of jobs) {
            const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
            const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

            // For delivery jobs with reservations, show actual capacity status
            let maxAssignments = job.maxCreepAssignments;
            if (maxAssignments === undefined) {
                if (job.type === 'delivery' && job.freeCapacity !== undefined) {
                    const totalReserved = job.totalReserved || 0;
                    const remainingCapacity = Math.max(0, job.freeCapacity - totalReserved);
                    maxAssignments = remainingCapacity > 0 ? -1 : '∞';
                } else {
                    maxAssignments = '∞';
                }
            }

            let icon = '❓';
            let color = '#ffffff';
            if (job.type === 'harvest') {
                icon = '⛏️';
                color = '#ffaa00';
            } else if (job.type === 'haul') {
                icon = '🚚';
                color = '#ffff00';
            } else if (job.type === 'build') {
                icon = '🔨';
                color = '#00ff00';
            } else if (job.type === 'upgrade') {
                icon = '⚡';
                color = '#00ffff';
            }

            // Job name and counts
            this.room.visual.text(
                `${icon} ${job.type} [${assignedCount}/${maxAssignments}] +${pendingCount}`,
                1, y,
                {
                    align: 'left',
                    font: 0.5,
                    color: color,
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );

            // Priority
            const effectivePriority = JobsManager.calculateEffectivePriority(this.room, job);
            this.room.visual.text(
                `P${effectivePriority}`,
                10, y,
                {
                    align: 'left',
                    font: 0.5,
                    color: effectivePriority <= 3 ? '#ff0000' : '#ffffff',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );

            y += 0.6;

            // Show parts needed vs assigned
            const partsText = [];
            const wantedParts = job.wantedCreepParts || {};
            const assignedParts = job.assignedCreepParts || {};
            const pendingParts = job.pendingCreepParts || {};
            for (const partType in wantedParts) {
                const wanted = wantedParts[partType];
                const assigned = assignedParts[partType] || 0;
                const pending = pendingParts[partType] || 0;
                partsText.push(`${partType}:${assigned}+${pending}/${wanted}`);
            }

            this.room.visual.text(
                `  ${partsText.join(' ')}`,
                1, y,
                {
                    align: 'left',
                    font: 0.4,
                    color: '#888888',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );

            y += 0.7;
        }
    }

    drawEnergyState() {
        const energyState = this.jobsRoomPartHandler.getEnergyState();
        const energy = this.room.energyAvailable;
        const capacity = this.room.energyCapacityAvailable;
        const storage = this.room.storage;
        const storedEnergy = storage ? storage.store[RESOURCE_ENERGY] : 0;
        const fill = capacity > 0 ? (energy / capacity) : 0;
        const fillPct = Math.floor(fill * 100);
        const bootstrap = this.jobsRoomPartHandler.isEmergencyBootstrap();

        let stateIcon = '⚡';
        let stateColor = '#00ff00';
        if (energyState === 'startup') {
            stateIcon = '🔴';
            stateColor = '#ff0000';
        } else if (energyState === 'tight') {
            stateIcon = '🟡';
            stateColor = '#ffff00';
        } else if (energyState === 'abundant') {
            stateIcon = '🟢';
            stateColor = '#00ff00';
        }

        // Energy state header
        this.room.visual.text(
            `${stateIcon} ${energyState.toUpperCase()}`,
            25, 1,
            {
                align: 'left',
                font: 0.7,
                color: stateColor,
                stroke: '#000000',
                strokeWidth: 0.05
            }
        );

        // Current energy
        this.room.visual.text(
            `Energy: ${energy}/${capacity}`,
            25, 2,
            {
                align: 'left',
                font: 0.5,
                color: '#ffffff',
                stroke: '#000000',
                strokeWidth: 0.05
            }
        );

        // Fill ratio + priority hints
        let haulHint = '';
        if (fill >= 0.95) haulHint = ' (haul prio +4)';
        else if (fill >= 0.85) haulHint = ' (haul prio +2)';

        this.room.visual.text(
            `Fill: ${fillPct}%${haulHint}`,
            25, 2.7,
            {
                align: 'left',
                font: 0.45,
                color: '#cccccc',
                stroke: '#000000',
                strokeWidth: 0.05
            }
        );

        if (energyState === 'startup') {
            this.room.visual.text(
                `Bootstrap: ${bootstrap ? 'ON' : 'off'}`,
                25, 3.25,
                {
                    align: 'left',
                    font: 0.45,
                    color: bootstrap ? '#ffaaaa' : '#888888',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );
        }

        // Storage
        if (storage) {
            this.room.visual.text(
                `Storage: ${storedEnergy}`,
                25, 3.85,
                {
                    align: 'left',
                    font: 0.5,
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );
        }
    }

    drawPlanning() {
        const x = 35;
        let y = 15.2;
        const w = 12;
        const h = 4.6;

        this.room.visual.rect(x, y, w, h, { fill: '#000000', opacity: 0.25 });
        this.room.visual.text('🧭 Planning', x, y + 0.5, {
            align: 'left',
            font: 0.55,
            color: '#ffffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        y += 1.1;

        // Spawn deferrals (big-body waiting)
        const def = (this.room.memory && this.room.memory.spawnPlan && this.room.memory.spawnPlan.deferred)
            ? this.room.memory.spawnPlan.deferred
            : null;

        const defEntries = [];
        if (def) {
            for (const jobId in def) {
                const entry = def[jobId];
                if (!entry || !entry.untilTick || entry.untilTick <= Game.time) continue;
                defEntries.push({ jobId: String(jobId), untilTick: entry.untilTick, desiredCost: entry.desiredCost || null });
            }
        }
        defEntries.sort((a, b) => a.untilTick - b.untilTick);

        if (defEntries.length > 0) {
            const e = defEntries[0];
            const dt = e.untilTick - Game.time;
            const cost = e.desiredCost ? `${e.desiredCost}E` : '?E';
            this.room.visual.text(`Spawn wait: +${dt}t (${cost})`, x, y, {
                align: 'left',
                font: 0.4,
                color: '#ffffaa',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            y += 0.5;
        } else {
            this.room.visual.text('Spawn wait: none', x, y, {
                align: 'left',
                font: 0.4,
                color: '#888888',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            y += 0.5;
        }

        // Build plan cooldowns & last placement
        const bp = (this.room.memory && this.room.memory.buildPlan) ? this.room.memory.buildPlan : null;
        if (bp && (bp.lastPlacedTick || bp.lastPlaced)) {
            const age = bp.lastPlacedTick ? (Game.time - bp.lastPlacedTick) : null;
            const lp = bp.lastPlaced;
            const lpText = lp && lp.structureType ? lp.structureType.replace('structure_', '') : 'unknown';
            const ageText = age !== null ? `${age}t ago` : '';
            this.room.visual.text(`Last site: ${lpText} ${ageText}`.trim(), x, y, {
                align: 'left',
                font: 0.4,
                color: '#aaffaa',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            y += 0.5;
        } else {
            this.room.visual.text('Last site: none', x, y, {
                align: 'left',
                font: 0.4,
                color: '#888888',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            y += 0.5;
        }

        if (bp && bp.cooldowns) {
            const cd = bp.cooldowns;
            const remainingGlobal = cd.globalUntilTick ? Math.max(0, cd.globalUntilTick - Game.time) : 0;

            let srcCds = 0;
            let srcMin = null;
            if (cd.sourceContainers) {
                for (const sid in cd.sourceContainers) {
                    const t = cd.sourceContainers[sid] || 0;
                    if (t > Game.time) {
                        srcCds++;
                        const r = t - Game.time;
                        srcMin = (srcMin === null) ? r : Math.min(srcMin, r);
                    }
                }
            }

            const extra = [];
            if (remainingGlobal > 0) extra.push(`g:${remainingGlobal}t`);
            if (srcCds > 0) extra.push(`src:${srcCds}(${srcMin}t)`);
            if (cd.extensionsUntilTick && cd.extensionsUntilTick > Game.time) extra.push(`ext:${cd.extensionsUntilTick - Game.time}t`);
            if (cd.controllerContainerUntilTick && cd.controllerContainerUntilTick > Game.time) extra.push(`ctrlC:${cd.controllerContainerUntilTick - Game.time}t`);

            this.room.visual.text(`CD: ${extra.length > 0 ? extra.join(' ') : 'none'}`, x, y, {
                align: 'left',
                font: 0.4,
                color: '#cccccc',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            y += 0.5;
        }

        // Controller container plan markers (reserved hauler tile + upgrader tiles)
        const controller = this.room.controller;
        if (controller) {
            const ctrlContainer = this._getControllerContainer();
            const sites = controller.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 3, {
                filter: s => s.structureType === STRUCTURE_CONTAINER
            });

            if (ctrlContainer) {
                const spots = this._getAdjacentSpotsAround(ctrlContainer.pos);
                const reserved = this._pickReservedSpotClosestToSpawn(spots);

                // Marker on container
                this.room.visual.text('C', ctrlContainer.pos.x, ctrlContainer.pos.y - 0.3, {
                    align: 'center',
                    font: 0.5,
                    color: '#00ffff',
                    stroke: '#000000',
                    strokeWidth: 0.05
                });

                for (const p of spots) {
                    const isReserved = reserved && p.x === reserved.x && p.y === reserved.y;
                    this.room.visual.circle(p.x, p.y, {
                        radius: 0.25,
                        fill: isReserved ? '#ffff00' : '#00ff00',
                        opacity: 0.25,
                        stroke: isReserved ? '#ffff00' : '#00ff00'
                    });
                    this.room.visual.text(isReserved ? 'H' : 'U', p.x, p.y + 0.15, {
                        align: 'center',
                        font: 0.35,
                        color: isReserved ? '#ffff00' : '#00ff00',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    });
                }
            } else if (sites && sites.length > 0) {
                const s = sites[0];
                this.room.visual.text('C*', s.pos.x, s.pos.y - 0.3, {
                    align: 'center',
                    font: 0.5,
                    color: '#00ffff',
                    stroke: '#000000',
                    strokeWidth: 0.05
                });
            }
        }
    }

    drawEnergyPrediction() {
        // Draw a small graph showing predicted energy over time
        const horizon = this._forecastHorizon || 500;
        const predictions = this.predictingRoomPartHandler.predictEnergyIncome(horizon, {
            step: 10,
            spawnQueue: this._spawnQueue || []
        });

        if (predictions.length === 0) return;

        const graphX = 22;
        const graphY = 1;
        const graphWidth = 12;
        const graphHeight = 3;

        // Draw title
        this.room.visual.text('⚡ Energy Forecast', graphX, graphY, {
            align: 'left',
            font: 0.6,
            color: '#ffff00',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        // Draw graph background
        this.room.visual.rect(graphX, graphY + 0.5, graphWidth, graphHeight, {
            fill: '#000000',
            opacity: 0.3
        });

        // Find max energy for autoscaling - use actual prediction data
        const maxPredictedEnergy = Math.max(...predictions.map(p => p.income || p.energy || 0));
        const maxEnergy = Math.max(maxPredictedEnergy, 1); // Avoid division by zero

        // Draw prediction line
        for (let i = 0; i < predictions.length - 1; i++) {
            const p1 = predictions[i];
            const p2 = predictions[i + 1];

            const energy1 = p1.income || p1.energy || 0;
            const energy2 = p2.income || p2.energy || 0;

            const x1 = graphX + (i / predictions.length) * graphWidth;
            const x2 = graphX + ((i + 1) / predictions.length) * graphWidth;

            const y1 = graphY + graphHeight + 0.5 - (energy1 / maxEnergy) * graphHeight;
            const y2 = graphY + graphHeight + 0.5 - (energy2 / maxEnergy) * graphHeight;

            this.room.visual.line(x1, y1, x2, y2, {
                color: '#ffff00',
                width: 0.05,
                opacity: 0.8
            });
        }

        // Draw axis labels
        this.room.visual.text('0t', graphX, graphY + graphHeight + 1, {
            align: 'left',
            font: 0.4,
            color: '#888888'
        });

        this.room.visual.text(`${horizon}t`, graphX + graphWidth, graphY + graphHeight + 1, {
            align: 'right',
            font: 0.4,
            color: '#888888'
        });

        this.room.visual.text(`${Math.ceil(maxEnergy)}`, graphX - 0.5, graphY + 0.5, {
            align: 'right',
            font: 0.4,
            color: '#888888'
        });

        this.room.visual.text(`0`, graphX - 0.5, graphY + graphHeight + 0.5, {
            align: 'right',
            font: 0.4,
            color: '#888888'
        });
    }

    drawSpawnQueue() {
        const spawns = this.room.find(FIND_MY_SPAWNS);
        let y = 4;

        const partCost = (partType) => {
            if (partType === 'WORK') return 100;
            if (partType === 'CARRY') return 50;
            if (partType === 'MOVE') return 50;
            if (partType === 'TOUGH') return 10;
            if (partType === 'ATTACK') return 80;
            if (partType === 'RANGED_ATTACK') return 150;
            if (partType === 'HEAL') return 250;
            if (partType === 'CLAIM') return 600;
            return 0;
        };

        const partConst = (partType) => {
            if (partType === 'WORK') return WORK;
            if (partType === 'CARRY') return CARRY;
            if (partType === 'MOVE') return MOVE;
            if (partType === 'TOUGH') return TOUGH;
            if (partType === 'ATTACK') return ATTACK;
            if (partType === 'RANGED_ATTACK') return RANGED_ATTACK;
            if (partType === 'HEAL') return HEAL;
            if (partType === 'CLAIM') return CLAIM;
            return null;
        };

        const getBaseCountsForJob = (job) => {
            const type = job && job.type ? job.type : null;
            if (type === 'harvest') return { WORK: 1, CARRY: 1, MOVE: 1 };
            if (type === 'build') return { WORK: 1, CARRY: 1, MOVE: 1 };
            if (type === 'upgrade') return { WORK: 1, CARRY: 1, MOVE: 1 };
            if (type === 'haul') return { CARRY: 1, MOVE: 1 };
            return { MOVE: 1 };
        };

        const buildBodyFromCounts = (counts, maxEnergy) => {
            const order = ['MOVE', 'CARRY', 'WORK', 'TOUGH', 'ATTACK', 'RANGED_ATTACK', 'HEAL', 'CLAIM'];
            const body = [];
            let cost = 0;
            const usedCounts = {};

            const addPart = (pt) => {
                const c = partConst(pt);
                const pc = partCost(pt);
                if (!c || pc <= 0) return false;
                if (cost + pc > maxEnergy) return false;
                if (body.length + 1 > 50) return false;
                body.push(c);
                cost += pc;
                usedCounts[pt] = (usedCounts[pt] || 0) + 1;
                return true;
            };

            for (const pt of order) {
                const need = counts[pt] || 0;
                for (let i = 0; i < need; i++) {
                    if (!addPart(pt)) return { body, cost, usedCounts };
                }
            }

            for (const pt in counts) {
                if (order.indexOf(pt) !== -1) continue;
                const need = counts[pt] || 0;
                for (let i = 0; i < need; i++) {
                    if (!addPart(pt)) return { body, cost, usedCounts };
                }
            }

            return { body, cost, usedCounts };
        };

        const countBodyParts = (body) => {
            const counts = { W: 0, C: 0, M: 0 };
            if (!body) return counts;
            for (const p of body) {
                if (p === WORK) counts.W++;
                else if (p === CARRY) counts.C++;
                else if (p === MOVE) counts.M++;
            }
            return counts;
        };

        this.room.visual.text('🏭 Spawns', 25, y, {
            align: 'left',
            font: 0.6,
            color: '#ffffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        y += 0.8;

        const nextJob = this.jobsRoomPartHandler.getNextCreepToSpawn();
        let nextJobPlan = null;
        let nextJobStatus = null;
        if (nextJob) {
            const energyState = this.jobsRoomPartHandler.getEnergyState();
            const energyAvailable = this.room.energyAvailable;

            const missingMainParts = {};
            const nextWantedParts = nextJob.wantedCreepParts || {};
            const nextAssignedParts = nextJob.assignedCreepParts || {};
            const nextPendingParts = nextJob.pendingCreepParts || {};
            for (const partType in nextWantedParts) {
                const assigned = nextAssignedParts[partType] || 0;
                const pending = nextPendingParts[partType] || 0;
                const total = assigned + pending;
                if (total < nextWantedParts[partType]) {
                    missingMainParts[partType] = nextWantedParts[partType] - total;
                }
            }

            const baseCounts = getBaseCountsForJob(nextJob);
            const requiredCounts = {};
            for (const pt in missingMainParts) requiredCounts[pt] = missingMainParts[pt];
            for (const pt in baseCounts) {
                requiredCounts[pt] = Math.max(requiredCounts[pt] || 0, baseCounts[pt] || 0);
            }

            nextJobPlan = buildBodyFromCounts(requiredCounts, this.room.energyCapacityAvailable);

            if (nextJobPlan && nextJobPlan.cost > 0) {
                if (energyAvailable >= nextJobPlan.cost) {
                    nextJobStatus = { state: 'ready' };
                } else {
                    const waitTicks = 50;
                    const predictions = this.predictingRoomPartHandler.predictEnergyIncome(waitTicks, { step: 5 });
                    let eta = null;
                    for (const p of predictions) {
                        if (p.energy >= nextJobPlan.cost) {
                            eta = p.tick;
                            break;
                        }
                    }
                    nextJobStatus = {
                        state: 'waiting',
                        need: nextJobPlan.cost,
                        have: energyAvailable,
                        etaTick: eta,
                        energyState
                    };
                }
            }
        }

        for (const spawn of spawns) {
            if (spawn.spawning) {
                const spawningCreep = Game.creeps[spawn.spawning.name];
                const progress = ((spawn.spawning.needTime - spawn.spawning.remainingTime) / spawn.spawning.needTime * 100).toFixed(0);

                this.room.visual.text(
                    `${spawn.name}: 🔄 ${progress}%`,
                    25, y,
                    {
                        align: 'left',
                        font: 0.5,
                        color: '#00ff00',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );

                // Draw progress bar at spawn
                this.room.visual.rect(spawn.pos.x - 0.5, spawn.pos.y + 0.6, 1, 0.1, {
                    fill: '#000000',
                    opacity: 0.5
                });
                this.room.visual.rect(
                    spawn.pos.x - 0.5,
                    spawn.pos.y + 0.6,
                    progress / 100,
                    0.1,
                    {
                        fill: '#00ff00',
                        opacity: 0.8
                    }
                );
            } else {
                if (nextJob) {
                    const energyState = this.jobsRoomPartHandler.getEnergyState();
                    const effectivePriority = JobsManager.calculateEffectivePriority(this.room, nextJob);

                    const plan = nextJobPlan;
                    const counts = plan ? countBodyParts(plan.body) : { W: 0, C: 0, M: 0 };
                    const cost = plan ? plan.cost : 0;

                    let statusText = '';
                    if (nextJobStatus && nextJobStatus.state === 'waiting') {
                        const eta = nextJobStatus.etaTick !== null ? `+${nextJobStatus.etaTick - Game.time}t` : 'noETA';
                        statusText = ` wait ${nextJobStatus.have}/${nextJobStatus.need}E ${eta}`;
                    } else if (nextJobStatus && nextJobStatus.state === 'ready') {
                        statusText = ` ready ${this.room.energyAvailable}/${cost}E`;
                    }

                    this.room.visual.text(
                        `${spawn.name}: ⏳ ${nextJob.type} (P${effectivePriority})`,
                        25, y,
                        {
                            align: 'left',
                            font: 0.5,
                            color: '#ffff00',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                } else {
                    this.room.visual.text(
                        `${spawn.name}: 💤 Idle`,
                        25, y,
                        {
                            align: 'left',
                            font: 0.5,
                            color: '#888888',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }
            }
            y += 0.6;
        }

        // Draw planned spawn queue
        y += 0.5;
        this.room.visual.text(`📅 Spawn Plan (${this._forecastHorizon || 500} ticks)`, 25, y, {
            align: 'left',
            font: 0.6,
            color: '#00ffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        y += 0.8;

        const spawnQueue = this._spawnQueue || [];

        for (let i = 0; i < Math.min(spawnQueue.length, 5); i++) {
            const planned = spawnQueue[i];
            const ticksUntil = planned.spawnTick - Game.time;

            const body = planned.body || [];
            const workCount = body.reduce((sum, p) => sum + (p === WORK ? 1 : 0), 0);

            let icon = '❓';
            if (planned.job.type === 'harvest') icon = '⛏️';
            else if (planned.job.type === 'haul') icon = '🚚';
            else if (planned.job.type === 'build') icon = '🔨';
            else if (planned.job.type === 'upgrade') icon = '⚡';

            this.room.visual.text(
                `+${ticksUntil}t: ${icon} ${planned.job.type} (${planned.bodyCost}E) W${workCount}`,
                25, y,
                {
                    align: 'left',
                    font: 0.45,
                    color: '#ffffff',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );
            y += 0.55;
        }

        if (spawnQueue.length > 5) {
            this.room.visual.text(
                `...and ${spawnQueue.length - 5} more`,
                25, y,
                {
                    align: 'left',
                    font: 0.4,
                    color: '#888888',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );
        }
    }

    drawJobTimeline() {
        // Draw a comprehensive timeline of all jobs with scheduling info
        const graphX = 1;
        const graphY = 32;
        const graphWidth = 18;
        const graphHeight = 8;

        this.room.visual.text('📊 Job Timeline & Analysis', graphX, graphY, {
            align: 'left',
            font: 0.7,
            color: '#00ffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });

        const jobs = this.jobsRoomPartHandler.getJobsForRoom();
        let detailY = graphY + 1;

        // Show current time
        this.room.visual.text(`⏰ Current Tick: ${Game.time}`, graphX, detailY, {
            align: 'left',
            font: 0.5,
            color: '#ffffff',
            stroke: '#000000',
            strokeWidth: 0.05
        });
        detailY += 0.7;

        // Separate jobs by type
        const haulJobs = jobs.filter(j => j.type === 'haul');
        const harvestJobs = jobs.filter(j => j.type === 'harvest');
        const otherJobs = jobs.filter(j => j.type !== 'haul' && j.type !== 'harvest');

        // Draw harvest jobs section
        if (harvestJobs.length > 0) {
            this.room.visual.text('⛏️ Harvest Jobs:', graphX, detailY, {
                align: 'left',
                font: 0.55,
                color: '#ffaa00',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            detailY += 0.6;

            for (const job of harvestJobs) {
                const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
                const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

                // Handle jobs with reservation system (delivery jobs)
                let maxAssign = job.maxCreepAssignments;
                if (maxAssign === undefined) {
                    if (job.type === 'delivery' && job.freeCapacity !== undefined) {
                        const totalReserved = job.totalReserved || 0;
                        const remainingCapacity = Math.max(0, job.freeCapacity - totalReserved);
                        maxAssign = remainingCapacity > 0 ? -1 : '∞';
                    } else {
                        maxAssign = '∞';
                    }
                }

                let statusColor = '#00ff00';
                let statusIcon = '✓';
                if (assignedCount === 0 && pendingCount === 0) {
                    statusColor = '#ff0000';
                    statusIcon = '✗';
                } else if (assignedCount < job.maxCreepAssignments) {
                    statusColor = '#ffff00';
                    statusIcon = '⚠';
                }

                const priority = JobsManager.calculateEffectivePriority(this.room, job);
                this.room.visual.text(
                    `${statusIcon} [${assignedCount}+${pendingCount}/${maxAssign}] P${priority}`,
                    graphX, detailY,
                    {
                        align: 'left',
                        font: 0.45,
                        color: statusColor,
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );

                // Show ticks until harvester is full
                if (job.ticksToFull !== undefined && job.ticksToFull !== null) {
                    const ticksUntil = job.ticksToFull;
                    this.room.visual.text(
                        `Next: ${ticksUntil > 0 ? '+' : ''}${ticksUntil}t`,
                        graphX + 5, detailY,
                        {
                            align: 'left',
                            font: 0.4,
                            color: ticksUntil < 0 ? '#ff0000' : '#ffffff',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }

                // Show harvester status and capacity fill ETA
                if (job.completionETA !== null && job.completionETA !== undefined) {
                    this.room.visual.text(
                        `Full:${job.completionETA}t`,
                        graphX + 10, detailY,
                        {
                            align: 'left',
                            font: 0.35,
                            color: '#ffaa00',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }

                detailY += 0.5;
            }

            detailY += 0.3;
        }

        // Draw haul jobs section with detailed timing
        if (haulJobs.length > 0) {
            this.room.visual.text('🚚 Haul Jobs:', graphX, detailY, {
                align: 'left',
                font: 0.55,
                color: '#ffff00',
                stroke: '#000000',
                strokeWidth: 0.05
            });
            detailY += 0.6;

            // Sort by scheduled time
            const sortedHaul = [...haulJobs].sort((a, b) => {
                const aTime = a.scheduledForTick || Infinity;
                const bTime = b.scheduledForTick || Infinity;
                return aTime - bTime;
            });

            for (const job of sortedHaul.slice(0, 8)) {
                const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
                const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

                // Handle jobs with reservation system (delivery and pickup jobs)
                let maxAssign = job.maxCreepAssignments;
                if (maxAssign === undefined) {
                    if (job.type === 'delivery' && job.freeCapacity !== undefined) {
                        const totalReserved = job.totalReserved || 0;
                        const remainingCapacity = Math.max(0, job.freeCapacity - totalReserved);
                        maxAssign = remainingCapacity > 0 ? -1 : '∞';
                    } else if (job.type === 'pickup' && job.amount !== undefined) {
                        const totalReserved = job.totalReserved || 0;
                        const remainingAmount = Math.max(0, job.amount - totalReserved);
                        maxAssign = remainingAmount > 0 ? -1 : '∞';
                    } else {
                        maxAssign = '∞';
                    }
                }

                let statusColor = '#ffffff';
                let statusIcon = '○';

                if (assignedCount > 0) {
                    statusColor = '#00ff00';
                    statusIcon = '●';
                } else if (pendingCount > 0) {
                    statusColor = '#ffff00';
                    statusIcon = '◐';
                }

                const priority = JobsManager.calculateEffectivePriority(this.room, job);
                const amount = Math.floor(job.amount || 0);

                let typeLabel = job.resourceType;
                if (typeLabel === 'harvester-drop') typeLabel = 'H-Drop';
                else if (typeLabel === 'dropped') typeLabel = 'Drop';
                else if (typeLabel === 'structure') typeLabel = 'Cont';

                // Show progress if available
                let progressText = '';
                if (job.progress !== undefined && job.progressTotal !== undefined && job.progressTotal > 0) {
                    const progressPercent = Math.floor((job.progress / job.progressTotal) * 100);
                    progressText = ` ${progressPercent}%`;
                }

                this.room.visual.text(
                    `${statusIcon} ${typeLabel} ${amount}E${progressText} [${assignedCount}+${pendingCount}/${maxAssign}] P${priority}`,
                    graphX, detailY,
                    {
                        align: 'left',
                        font: 0.4,
                        color: statusColor,
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );

                // Show scheduling info
                if (job.scheduledForTick) {
                    const ticksUntil = job.scheduledForTick - Game.time;
                    let schedColor = '#ffffff';
                    let schedIcon = '⏱';

                    if (ticksUntil < -10) {
                        schedColor = '#ff0000';
                        schedIcon = '🚨';
                    } else if (ticksUntil < 0) {
                        schedColor = '#ff8800';
                        schedIcon = '⚠';
                    } else if (ticksUntil < 20) {
                        schedColor = '#ffff00';
                        schedIcon = '⏰';
                    }

                    this.room.visual.text(
                        `${schedIcon} ${ticksUntil > 0 ? '+' : ''}${ticksUntil}t`,
                        graphX + 8, detailY,
                        {
                            align: 'left',
                            font: 0.4,
                            color: schedColor,
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }

                // Show completion ETA if available
                if (job.completionETA !== null && job.completionETA !== undefined) {
                    this.room.visual.text(
                        `Done:${job.completionETA}t`,
                        graphX + 12, detailY,
                        {
                            align: 'left',
                            font: 0.35,
                            color: '#00ff00',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }

                detailY += 0.5;
            }

            if (sortedHaul.length > 8) {
                this.room.visual.text(
                    `...and ${sortedHaul.length - 8} more haul jobs`,
                    graphX, detailY,
                    {
                        align: 'left',
                        font: 0.35,
                        color: '#888888',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );
                detailY += 0.5;
            }
        }

        // Summary statistics
        detailY += 0.3;
        const totalJobs = jobs.length;
        const activeJobs = jobs.filter(j => Object.keys(j.assignedCreepIds || {}).length > 0).length;
        const overdueJobs = jobs.filter(j => j.scheduledForTick && j.scheduledForTick < Game.time).length;

        this.room.visual.text(
            `📈 Summary: ${activeJobs}/${totalJobs} active`,
            graphX, detailY,
            {
                align: 'left',
                font: 0.5,
                color: '#00ffff',
                stroke: '#000000',
                strokeWidth: 0.05
            }
        );

        if (overdueJobs > 0) {
            this.room.visual.text(
                `⚠ ${overdueJobs} overdue!`,
                graphX + 7, detailY,
                {
                    align: 'left',
                    font: 0.5,
                    color: '#ff0000',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );
        }
    }

    drawJobLocationVisuals() {
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();

        for (const job of jobs) {
            let targetPos = null;
            let targetObject = null;

            // Get the target position for this job
            if (job.objectId) {
                targetObject = Game.getObjectById(job.objectId);
                if (targetObject && targetObject.pos) {
                    targetPos = targetObject.pos;
                }
            } else if (job.targetPos) {
                targetPos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
            }

            if (!targetPos || targetPos.roomName !== this.room.name) continue;

            // Calculate job completion ETA
            const assignedCreeps = Object.keys(job.assignedCreepIds || {});
            const assignedCount = assignedCreeps.length;
            const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

            let icon = '❓';
            let color = '#ffffff';
            let statusText = '';
            let etaText = '';

            if (job.type === 'harvest') {
                icon = '⛏️';
                color = '#ffaa00';

                if (assignedCount > 0) {
                    if (job.completionETA !== null && job.completionETA !== undefined) {
                        etaText = `Full: ${job.completionETA}t`;
                        statusText = '✓ Active';
                    } else if (job.arrivalETA !== null && job.arrivalETA !== undefined) {
                        statusText = '⏳ Moving';
                    } else {
                        statusText = '✓ Assigned';
                    }
                } else if (pendingCount > 0) {
                    statusText = '🔄 Spawning';
                } else {
                    statusText = '✗ No Creeps';
                    color = '#ff0000';
                }

            } else if (job.type === 'haul') {
                icon = '🚚';
                color = '#ffff00';

                const amount = Math.floor(job.amount || 0);
                const reserved = Math.floor(job.totalReserved || 0);
                const available = amount - reserved;

                if (assignedCount > 0) {
                    if (job.completionETA !== null && job.completionETA !== undefined) {
                        etaText = `Done: ${job.completionETA}t`;
                        statusText = '✓ Active';
                    } else {
                        statusText = '✓ Assigned';
                    }
                } else if (pendingCount > 0) {
                    statusText = '🔄 Pending';
                } else {
                    statusText = '○ Waiting';
                }

                // Show amount with reservation info
                if (reserved > 0) {
                    statusText = `${available}E/${amount}E`;
                } else {
                    statusText = `${amount}E`;
                }

                // Show scheduled time if set
                if (job.scheduledForTick) {
                    const ticksUntil = job.scheduledForTick - Game.time;
                    let schedColor = color;

                    if (ticksUntil < -10) {
                        schedColor = '#ff0000';
                        statusText = '🚨 LATE';
                    } else if (ticksUntil < 0) {
                        schedColor = '#ff8800';
                        statusText = '⚠ Overdue';
                    }

                    color = schedColor;
                }

            } else if (job.type === 'build') {
                icon = '🔨';
                color = '#00ff00';

                if (assignedCount > 0) {
                    statusText = '✓ Building';
                } else {
                    statusText = '○ Waiting';
                }
            }

            // Draw circle around target position
            this.room.visual.circle(targetPos.x, targetPos.y, {
                radius: 0.5,
                fill: 'transparent',
                stroke: color,
                strokeWidth: 0.1,
                opacity: 0.6
            });

            // Draw icon at position
            this.room.visual.text(
                icon,
                targetPos.x,
                targetPos.y - 0.3,
                {
                    font: 0.5,
                    color: color,
                    stroke: '#000000',
                    strokeWidth: 0.08
                }
            );

            // Draw status text
            this.room.visual.text(
                statusText,
                targetPos.x,
                targetPos.y + 0.3,
                {
                    font: 0.35,
                    color: color,
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );

            // Draw ETA if available
            if (etaText) {
                this.room.visual.text(
                    etaText,
                    targetPos.x,
                    targetPos.y + 0.65,
                    {
                        font: 0.3,
                        color: '#ffffff',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );
            }

            // Draw assignment count
            const assignText = `[${assignedCount}+${pendingCount}]`;
            this.room.visual.text(
                assignText,
                targetPos.x,
                targetPos.y - 0.7,
                {
                    font: 0.3,
                    color: '#888888',
                    stroke: '#000000',
                    strokeWidth: 0.05
                }
            );

            // Draw progress bar if progress data available
            if (job.progress !== undefined && job.progressTotal !== undefined && job.progressTotal > 0) {
                const progressPercent = job.progress / job.progressTotal;

                // Progress bar background
                this.room.visual.rect(
                    targetPos.x - 0.4,
                    targetPos.y + 0.85,
                    0.8,
                    0.1,
                    {
                        fill: '#000000',
                        opacity: 0.5
                    }
                );

                // Progress bar fill
                if (progressPercent > 0) {
                    this.room.visual.rect(
                        targetPos.x - 0.4,
                        targetPos.y + 0.85,
                        0.8 * progressPercent,
                        0.1,
                        {
                            fill: color,
                            opacity: 0.8
                        }
                    );
                }

                // Progress text
                this.room.visual.text(
                    `${Math.floor(job.progress)}/${Math.floor(job.progressTotal)}`,
                    targetPos.x,
                    targetPos.y + 1.1,
                    {
                        font: 0.25,
                        color: '#ffffff',
                        stroke: '#000000',
                        strokeWidth: 0.03
                    }
                );
            }
        }
    }

    drawCreepAssignments() {
        const creeps = this.room.find(FIND_MY_CREEPS);

        for (const creep of creeps) {
            if (creep.memory.jobId && creep.memory.jobRoom) {
                const job = this.jobsRoomPartHandler.getJobById(creep.memory.jobRoom, creep.memory.jobId);

                if (job) {
                    let icon = '❓';
                    let color = '#ffffff';
                    if (job.type === 'harvest') {
                        icon = '⛏️';
                        color = '#ffaa00';
                    } else if (job.type === 'haul') {
                        icon = '🚚';
                        color = '#ffff00';
                    } else if (job.type === 'build') {
                        icon = '🔨';
                        color = '#00ff00';
                    }

                    // Draw line to job target
                    if (job.objectId) {
                        const target = Game.getObjectById(job.objectId);
                        if (target) {
                            this.room.visual.line(creep.pos, target.pos, {
                                color: color,
                                width: 0.1,
                                opacity: 0.3,
                                lineStyle: 'dashed'
                            });
                        }
                    }

                    // Draw job info above creep
                    this.room.visual.text(
                        icon,
                        creep.pos.x,
                        creep.pos.y - 0.5,
                        {
                            font: 0.4,
                            color: color,
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );

                    // Show ETA or scheduling info for haul jobs
                    if (job.type === 'haul' && job.arrivalETA !== null && job.arrivalETA !== undefined) {
                        let etaColor = '#00ff00';
                        if (job.scheduledForTick) {
                            const arrival = Game.time + job.arrivalETA;
                            const onTime = arrival <= job.scheduledForTick;
                            etaColor = onTime ? '#00ff00' : '#ff0000';
                        }

                        this.room.visual.text(
                            `${job.arrivalETA}t`,
                            creep.pos.x,
                            creep.pos.y - 0.9,
                            {
                                font: 0.3,
                                color: etaColor,
                                stroke: '#000000',
                                strokeWidth: 0.03
                            }
                        );
                    }
                }
            }

            // Draw energy level as bar below creep
            if (creep.store.getCapacity(RESOURCE_ENERGY) > 0) {
                const energyPercent = creep.store.getUsedCapacity(RESOURCE_ENERGY) / creep.store.getCapacity(RESOURCE_ENERGY);

                this.room.visual.rect(creep.pos.x - 0.4, creep.pos.y + 0.5, 0.8, 0.1, {
                    fill: '#000000',
                    opacity: 0.5
                });

                if (energyPercent > 0) {
                    this.room.visual.rect(
                        creep.pos.x - 0.4,
                        creep.pos.y + 0.5,
                        0.8 * energyPercent,
                        0.1,
                        {
                            fill: '#ffff00',
                            opacity: 0.8
                        }
                    );
                }
            }
        }
    }

    drawSourceInfo() {
        const sources = this.room.find(FIND_SOURCES);

        for (const source of sources) {
            const job = this.jobsRoomPartHandler.getJobByObjectId(source.id);

            if (job) {
                const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
                const pendingCount = Object.keys(job.pendingCreepIds || {}).length;
                const maxAssignments = job.maxCreepAssignments || 0;

                // Draw harvester count
                this.room.visual.text(
                    `${assignedCount}/${maxAssignments}`,
                    source.pos.x,
                    source.pos.y - 1.2,
                    {
                        font: 0.5,
                        color: assignedCount >= maxAssignments ? '#00ff00' : '#ff0000',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );

                if (pendingCount > 0) {
                    this.room.visual.text(
                        `+${pendingCount}`,
                        source.pos.x,
                        source.pos.y - 0.7,
                        {
                            font: 0.4,
                            color: '#ffff00',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }

                // Draw dropped energy indicator
                const droppedEnergy = source.pos.findInRange(FIND_DROPPED_RESOURCES, 2, {
                    filter: r => r.resourceType === RESOURCE_ENERGY
                });

                if (droppedEnergy.length > 0) {
                    const totalDropped = droppedEnergy.reduce((sum, r) => sum + r.amount, 0);
                    this.room.visual.text(
                        `💰${totalDropped}`,
                        source.pos.x,
                        source.pos.y + 1.2,
                        {
                            font: 0.4,
                            color: totalDropped > 500 ? '#ff0000' : '#ffff00',
                            stroke: '#000000',
                            strokeWidth: 0.05
                        }
                    );
                }
            }

            // Draw energy regeneration
            if (source.ticksToRegeneration) {
                this.room.visual.text(
                    `⏱️${source.ticksToRegeneration}`,
                    source.pos.x + 1,
                    source.pos.y,
                    {
                        font: 0.4,
                        color: '#ffffff',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );
            }
        }

        // Draw dropped energy elsewhere in room (not near sources)
        const allDroppedEnergy = this.room.find(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 100
        });

        for (const dropped of allDroppedEnergy) {
            // Check if it's near a source (already shown)
            const nearSource = dropped.pos.findInRange(FIND_SOURCES, 2).length > 0;
            if (!nearSource) {
                this.room.visual.text(
                    `💰${dropped.amount}`,
                    dropped.pos.x,
                    dropped.pos.y - 0.3,
                    {
                        font: 0.4,
                        color: '#ffaa00',
                        stroke: '#000000',
                        strokeWidth: 0.05
                    }
                );
            }
        }
    }

    drawJobList() {
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();
        if (jobs.length === 0) return;

        const x = 1;
        let y = 10;
        const lineHeight = 0.7;

        // Background
        const bgHeight = Math.min(jobs.length * lineHeight + 1.2, 15);
        this.room.visual.rect(x - 0.5, y - 0.6, 20, bgHeight, { fill: '#000000', opacity: 0.3 });

        // Header
        this._hudText(`📋 JOBS (${jobs.length})`, x, y, { font: 0.6, color: '#00ffff' });
        y += 0.9;

        for (const job of jobs) {
            const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
            const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

            // Handle jobs with reservation system (delivery and pickup jobs)
            let maxAssignments = job.maxCreepAssignments;
            if (maxAssignments === undefined) {
                if (job.type === 'delivery' && job.freeCapacity !== undefined) {
                    const totalReserved = job.totalReserved || 0;
                    const remainingCapacity = Math.max(0, job.freeCapacity - totalReserved);
                    maxAssignments = remainingCapacity > 0 ? -1 : '∞';
                } else if (job.type === 'pickup' && job.amount !== undefined) {
                    const totalReserved = job.totalReserved || 0;
                    const remainingAmount = Math.max(0, job.amount - totalReserved);
                    maxAssignments = remainingAmount > 0 ? -1 : '∞';
                } else {
                    maxAssignments = '∞';
                }
            }

            let icon = '❓';
            let color = '#ffffff';
            if (job.type === 'harvest') {
                icon = '⛏️';
                color = '#ffaa00';
            } else if (job.type === 'haul') {
                icon = '🚚';
                color = '#ffff00';
            } else if (job.type === 'build') {
                icon = '🔨';
                color = '#00ff00';
            } else if (job.type === 'upgrade') {
                icon = '⚡';
                color = '#00ffff';
            }

            // Calculate priority
            const effectivePriority = JobsManager.calculateEffectivePriority(this.room, job);

            // Status indicator
            let status = '✓';
            let statusColor = '#00ff00';
            if (assignedCount === 0 && pendingCount === 0) {
                status = '⚠';
                statusColor = '#ff0000';
            } else if (assignedCount < maxAssignments && maxAssignments !== '∞') {
                status = '◐';
                statusColor = '#ffff00';
            }

            // Get position info
            let posText = '';
            if (job.targetPos) {
                posText = ` @${job.targetPos.x},${job.targetPos.y}`;
            } else if (job.objectId) {
                const obj = Game.getObjectById(job.objectId);
                if (obj && obj.pos) {
                    posText = ` @${obj.pos.x},${obj.pos.y}`;
                }
            }

            // Job line: icon type [assigned/max] +pending P# @pos status
            const jobText = `${icon} ${job.type} [${assignedCount}/${maxAssignments}] +${pendingCount} P${effectivePriority}${posText}`;
            this._hudText(jobText, x, y, { font: 0.45, color: color });
            this._hudText(status, x + 17, y, { font: 0.5, color: statusColor });

            y += lineHeight;

            // Stop if we run out of space
            if (y > 24) {
                this._hudText('...', x, y, { font: 0.4, color: '#888888' });
                break;
            }
        }
    }

    drawJobMarkers() {
        const jobs = this.jobsRoomPartHandler.getJobsForRoom();

        for (const job of jobs) {
            if (!job.targetPos || job.targetPos.roomName !== this.room.name) continue;

            const pos = new RoomPosition(job.targetPos.x, job.targetPos.y, job.targetPos.roomName);
            const assignedCount = Object.keys(job.assignedCreepIds || {}).length;
            const pendingCount = Object.keys(job.pendingCreepIds || {}).length;

            // Handle jobs with reservation system (delivery and pickup jobs)
            let maxAssignments = job.maxCreepAssignments;
            if (maxAssignments === undefined) {
                if (job.type === 'delivery' && job.freeCapacity !== undefined) {
                    const totalReserved = job.totalReserved || 0;
                    const remainingCapacity = Math.max(0, job.freeCapacity - totalReserved);
                    maxAssignments = remainingCapacity > 0 ? -1 : '∞';
                } else if (job.type === 'pickup' && job.amount !== undefined) {
                    const totalReserved = job.totalReserved || 0;
                    const remainingAmount = Math.max(0, job.amount - totalReserved);
                    maxAssignments = remainingAmount > 0 ? -1 : '∞';
                } else {
                    maxAssignments = '∞';
                }
            }

            let icon = '❓';
            let color = '#ffffff';
            if (job.type === 'harvest') {
                icon = '⛏️';
                color = '#ffaa00';
            } else if (job.type === 'haul') {
                icon = '🚚';
                color = '#ffff00';
            } else if (job.type === 'build') {
                icon = '🔨';
                color = '#00ff00';
            } else if (job.type === 'upgrade') {
                icon = '⚡';
                color = '#00ffff';
            }

            // Circle around job position
            let circleColor = color;
            if (assignedCount === 0 && pendingCount === 0) {
                circleColor = '#ff0000'; // No workers
            } else if (assignedCount > maxAssignments && maxAssignments !== '∞') {
                circleColor = '#ff8800'; // Over-assigned
            }

            this.room.visual.circle(pos, {
                radius: 0.5,
                fill: 'transparent',
                stroke: circleColor,
                strokeWidth: 0.15,
                opacity: 0.8
            });

            // Icon above position
            this.room.visual.text(icon, pos.x, pos.y - 0.6, {
                font: 0.5,
                color: color,
                stroke: '#000000',
                strokeWidth: 0.1,
                opacity: 0.9
            });

            // Worker count below position
            const countText = assignedCount > 0 ? `${assignedCount}/${maxAssignments}` : `0/${maxAssignments}`;
            this.room.visual.text(countText, pos.x, pos.y + 0.7, {
                font: 0.35,
                color: '#ffffff',
                stroke: '#000000',
                strokeWidth: 0.08,
                opacity: 0.9
            });
        }
    }
}
