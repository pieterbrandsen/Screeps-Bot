import RoomUtils from "../utils/roomUtils.js";
import Constants from '../utils/constants.js';

export default class RoomTravel {
    static _ensureRoomMemory(room) {
        if (!room || !room.memory) return null;
        if (!room.memory.travel) {
            room.memory.travel = Object.create(null);
        }
        if (!room.memory.travel.pickup) {
            room.memory.travel.pickup = Object.create(null);
        }
        if (!room.memory.travel.dropoff) {
            room.memory.travel.dropoff = Object.create(null);
        }
        return room.memory.travel;
    }

    static _posKey(pos) {
        return RoomUtils.posKey(pos);
    }

    static _candidateVersion(room) {
        // Cheap change detector: counts + ids that can appear/disappear.
        const spawns = room.find(FIND_MY_SPAWNS);
        const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
        const storageId = room.storage ? room.storage.id : '';
        return `${spawns.length}:${extensions.length}:${storageId}`;
    }

    static _getDropoffCandidates(room) {
        // Deliver targets: spawns + extensions. (Storage is handled as a fallback elsewhere.)
        const spawns = room.find(FIND_MY_SPAWNS);
        const extensions = room.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_EXTENSION });
        return [...spawns, ...extensions].filter(s => s && s.pos);
    }

    static _getBudget() {
        if (!global._travelBudget) global._travelBudget = { tick: -1, used: 0 };
        if (global._travelBudget.tick !== Game.time) {
            global._travelBudget.tick = Game.time;
            global._travelBudget.used = 0;
        }
        return global._travelBudget;
    }

    static _buildCostMatrix(room) {
        const costs = new PathFinder.CostMatrix();

        // Favor roads.
        const structures = room.find(FIND_STRUCTURES);
        for (const s of structures) {
            if (!s || !s.pos) continue;

            if (s.structureType === STRUCTURE_ROAD) {
                costs.set(s.pos.x, s.pos.y, 1);
                continue;
            }

            if (s.structureType === STRUCTURE_CONTAINER) {
                costs.set(s.pos.x, s.pos.y, 1);
                continue;
            }

            if (s.structureType === STRUCTURE_RAMPART) {
                // Allow own ramparts.
                if (!s.my) costs.set(s.pos.x, s.pos.y, 255);
                continue;
            }

            // Block other non-walkables.
            if (s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_KEEPER_LAIR) {
                costs.set(s.pos.x, s.pos.y, 255);
            }
        }

        return costs;
    }

    static _findPathLen(room, fromPos, toPos, range = 1) {
        if (!room || !fromPos || !toPos) return null;
        if (fromPos.roomName !== room.name || toPos.roomName !== room.name) return null;

        const budget = this._getBudget();
        const maxComputes = Constants.MAX_PATH_COMPUTES;
        if (budget.used >= maxComputes) return null;
        budget.used++;

        const search = PathFinder.search(
            fromPos,
            { pos: toPos, range: range },
            {
                maxOps: Constants.PATHFINDER_MAX_OPS,
                plainCost: Constants.PLAIN_COST,
                swampCost: Constants.SWAMP_COST,
                roomCallback: (roomName) => {
                    if (roomName !== room.name) return false;
                    return this._buildCostMatrix(room);
                }
            }
        );

        if (!search || search.incomplete || !search.path) return null;
        return search.path.length;
    }

    static getBestDropoffForPickup(room, pickupPos, options = Object.create(null)) {
        if (!room || !pickupPos || pickupPos.roomName !== room.name) return null;

        const mem = this._ensureRoomMemory(room);
        if (!mem) return null;

        const ttl = options.ttl || 1000;
        const pickupKey = this._posKey(pickupPos);
        const version = this._candidateVersion(room);

        const cached = mem.pickup[pickupKey];
        if (cached && cached.version === version && (Game.time - cached.computedAt) <= ttl) {
            // Re-hydrate pos if we can.
            let pos = null;
            if (cached.bestPos) {
                pos = new RoomPosition(cached.bestPos.x, cached.bestPos.y, room.name);
            } else if (cached.bestId) {
                const obj = Game.getObjectById(cached.bestId);
                if (obj && obj.pos) pos = obj.pos;
            }

            return {
                pickupKey,
                version,
                bestId: cached.bestId,
                bestPos: pos,
                pathLen: cached.pathLen,
                oneWayTicks: cached.oneWayTicks,
                roundTripTicks: cached.roundTripTicks
            };
        }

        const candidates = this._getDropoffCandidates(room);
        if (candidates.length === 0) return null;

        // Pre-filter by cheap range, then do PathFinder only for top K.
        const ranked = candidates
            .map(s => ({ s, r: pickupPos.getRangeTo(s.pos) }))
            .sort((a, b) => a.r - b.r);

        const topK = Math.min(ranked.length, options.topK || 8);

        let best = null;
        for (let i = 0; i < topK; i++) {
            const cand = ranked[i].s;
            const len = this._findPathLen(room, pickupPos, cand.pos, 1);
            const fallbackLen = Math.ceil(ranked[i].r * 1.3);
            const pathLen = (len !== null) ? len : fallbackLen;

            if (!best || pathLen < best.pathLen) {
                best = { id: cand.id, pos: cand.pos, pathLen: pathLen };
            }
        }

        if (!best) return null;

        const oneWayTicks = Math.max(1, Math.ceil(best.pathLen * 1.3));
        const interactionOverhead = Constants.INTERACTION_OVERHEAD;
        const roundTripTicks = (oneWayTicks * 2) + interactionOverhead;

        mem.pickup[pickupKey] = {
            version,
            computedAt: Game.time,
            bestId: best.id,
            bestPos: { x: best.pos.x, y: best.pos.y },
            pathLen: best.pathLen,
            oneWayTicks,
            roundTripTicks
        };

        return {
            pickupKey,
            version,
            bestId: best.id,
            bestPos: best.pos,
            pathLen: best.pathLen,
            oneWayTicks,
            roundTripTicks
        };
    }

    static estimateRoundTripTicks(room, pickupPos, options = Object.create(null)) {
        const best = this.getBestDropoffForPickup(room, pickupPos, options);
        if (!best || !best.roundTripTicks) {
            // Fallback to your old heuristic.
            const spawns = room.find(FIND_MY_SPAWNS);
            if (!spawns || spawns.length === 0) return 50;
            const minRange = pickupPos.getRangeTo(spawns[0]);
            return (Math.ceil(minRange * 1.3) * 2) + 4;
        }
        return best.roundTripTicks;
    }

    static estimateOneWayTicks(room, pickupPos, options = Object.create(null)) {
        const best = this.getBestDropoffForPickup(room, pickupPos, options);
        if (!best || !best.oneWayTicks) {
            const spawns = room.find(FIND_MY_SPAWNS);
            if (!spawns || spawns.length === 0) return 25;
            return Math.max(1, Math.ceil(pickupPos.getRangeTo(spawns[0]) * 1.3));
        }
        return best.oneWayTicks;
    }
}
