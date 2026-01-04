import Debug from '../debug/debug.js'; import RoomUtils from "../utils/roomUtils.js";
export default class MoveManager {
    static startTick() {
        if (this._tick === Game.time) return;

        this._tick = Game.time;
        this._reserved = Object.create(null); // roomName -> { key: creepName }
        this._reservedByCreep = Object.create(null); // creepName -> { roomName, key }
        this._occupied = Object.create(null); // roomName -> { key: creepName }

        for (const creepName in Game.creeps) {
            const creep = Game.creeps[creepName];
            const roomName = creep.room.name;
            const key = `${creep.pos.x},${creep.pos.y}`;

            if (!this._occupied[roomName]) this._occupied[roomName] = Object.create(null);
            this._occupied[roomName][key] = creepName;
        }

        this._applyStaticBlocks();
    }

    static blockPosition(pos, ttlTicks = 1) {
        if (!pos || pos.x === undefined || pos.y === undefined || !pos.roomName) return;

        if (!Memory.moveBlocks) Memory.moveBlocks = Object.create(null);
        if (!Memory.moveBlocks[pos.roomName]) Memory.moveBlocks[pos.roomName] = Object.create(null);

        const key = `${pos.x},${pos.y}`;
        const untilTick = Game.time + Math.max(1, ttlTicks);

        const existing = Memory.moveBlocks[pos.roomName][key];
        if (!existing || existing < untilTick) {
            Memory.moveBlocks[pos.roomName][key] = untilTick;
        }
    }

    static _applyStaticBlocks() {
        if (!Memory.moveBlocks) return;

        for (const roomName in Memory.moveBlocks) {
            const blocks = Memory.moveBlocks[roomName];
            if (!blocks) continue;

            for (const key in blocks) {
                const untilTick = blocks[key];
                if (untilTick <= Game.time) {
                    delete blocks[key];
                    continue;
                }

                if (!this._reserved[roomName]) this._reserved[roomName] = Object.create(null);
                // Use a sentinel owner name so we can treat it as occupied.
                this._reserved[roomName][key] = '__blocked__';
            }

            if (Object.keys(blocks).length === 0) {
                delete Memory.moveBlocks[roomName];
            }
        }

        if (Object.keys(Memory.moveBlocks).length === 0) {
            delete Memory.moveBlocks;
        }
    }

    static _isReserved(roomName, key, byCreepName) {
        const roomReservations = this._reserved && this._reserved[roomName];
        if (!roomReservations) return false;

        const owner = roomReservations[key];
        return owner && owner !== byCreepName;
    }

    static _isOccupied(roomName, key, byCreepName) {
        const roomOccupied = this._occupied && this._occupied[roomName];
        if (!roomOccupied) return false;

        const occupant = roomOccupied[key];
        if (!occupant || occupant === byCreepName) return false;

        // If that creep has already reserved a different tile, assume it will leave.
        const reservedBy = this._reservedByCreep && this._reservedByCreep[occupant];
        if (reservedBy && reservedBy.roomName === roomName && reservedBy.key !== key) {
            return false;
        }

        return true;
    }

    static _reserve(creep, pos) {
        const roomName = pos.roomName;
        const key = RoomUtils.posKey(pos);

        if (!this._reserved[roomName]) this._reserved[roomName] = Object.create(null);
        this._reserved[roomName][key] = creep.name;
        this._reservedByCreep[creep.name] = { roomName, key };
    }

    static _isWalkable(room, x, y) {
        const terrain = room.getTerrain();
        return terrain.get(x, y) !== TERRAIN_MASK_WALL;
    }

    static moveTo(creep, target, options = Object.create(null)) {
        this.startTick();

        if (!creep || creep.spawning) {
            return ERR_BUSY;
        }

        if (creep.fatigue > 0) {
            return ERR_TIRED;
        }

        const range = options.range === undefined ? 1 : options.range;

        const targetPos = this._normalizeTargetPos(target);
        if (!targetPos) {
            return ERR_INVALID_TARGET;
        }

        // Cross-room movement: keep it simple and use engine pathing.
        if (targetPos.roomName !== creep.room.name) {
            return creep.moveTo(targetPos, { reusePath: 5 });
        }

        const nextPos = this._getNextStep(creep, targetPos, range, options);
        if (!nextPos) {
            if (creep.pos.inRangeTo(targetPos, range)) {
                return OK;
            }
            return ERR_NO_PATH;
        }

        const key = `${nextPos.x},${nextPos.y}`;
        if (this._isReserved(creep.room.name, key, creep.name) || this._isOccupied(creep.room.name, key, creep.name)) {
            // Try a simple alternate adjacent step toward the goal.
            const alt = this._findAlternateStep(creep, targetPos);
            if (!alt) {
                Debug.count(creep.room.name, 'moveBlocked');
                if (Debug.throttle(`moveBlocked:${creep.name}`, 10, creep.room.name)) {
                    Debug.log(creep.room.name, 'debug', `move:blocked ${creep.name}`, {
                        from: { x: creep.pos.x, y: creep.pos.y },
                        to: { x: targetPos.x, y: targetPos.y },
                        next: { x: nextPos.x, y: nextPos.y },
                        reserved: this._isReserved(creep.room.name, key, creep.name),
                        occupied: this._isOccupied(creep.room.name, key, creep.name)
                    });
                }
                return ERR_BUSY;
            }

            this._reserve(creep, alt.pos);
            Debug.count(creep.room.name, 'moveAlt');
            return creep.move(alt.dir);
        }

        this._reserve(creep, nextPos);
        const direction = creep.pos.getDirectionTo(nextPos);
        const moveResult = creep.move(direction);
        return moveResult;
    }

    static _getNextStep(creep, targetPos, range, options) {
        const roomName = creep.room.name;

        const search = PathFinder.search(
            creep.pos,
            { pos: targetPos, range: range },
            {
                maxOps: options.maxOps || 2000,
                plainCost: options.plainCost || 2,
                swampCost: options.swampCost || 10,
                roomCallback: (cbRoomName) => {
                    if (cbRoomName !== roomName) return false;

                    const costs = new PathFinder.CostMatrix();

                    const reservations = this._reserved[cbRoomName] || Object.create(null);
                    for (const key in reservations) {
                        const [xStr, yStr] = key.split(',');
                        const x = Number(xStr);
                        const y = Number(yStr);
                        costs.set(x, y, 255);
                    }

                    const occupied = this._occupied[cbRoomName] || Object.create(null);
                    for (const key in occupied) {
                        const occupant = occupied[key];
                        if (occupant === creep.name) continue;

                        const reservedBy = this._reservedByCreep && this._reservedByCreep[occupant];
                        if (reservedBy && reservedBy.roomName === cbRoomName && reservedBy.key !== key) {
                            continue;
                        }

                        const [xStr, yStr] = key.split(',');
                        const x = Number(xStr);
                        const y = Number(yStr);
                        costs.set(x, y, 255);
                    }

                    return costs;
                }
            }
        );

        if (!search.path || search.path.length === 0) return null;
        return search.path[0];
    }

    static _findAlternateStep(creep, targetPos) {
        let best = null;
        for (let dir = 1; dir <= 8; dir++) {
            const pos = this._getAdjacentPosition(creep.pos, dir);
            if (!pos || pos.roomName !== creep.room.name) continue;
            if (!this._isWalkable(creep.room, pos.x, pos.y)) continue;

            const key = `${pos.x},${pos.y}`;
            if (this._isReserved(creep.room.name, key, creep.name)) continue;
            if (this._isOccupied(creep.room.name, key, creep.name)) continue;

            const score = pos.getRangeTo(targetPos);
            if (!best || score < best.score) {
                best = { dir, pos, score };
            }
        }

        return best;
    }

    static _getAdjacentPosition(pos, dir) {
        return RoomUtils.getAdjacentPosition(pos, dir);
    }

    static _normalizeTargetPos(target) {
        if (!target) return null;

        if (target.pos && target.pos.x !== undefined) return target.pos;

        if (target.x !== undefined && target.y !== undefined && target.roomName) {
            return new RoomPosition(target.x, target.y, target.roomName);
        }

        return null;
    }
}
