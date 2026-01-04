/**
 * Room Utilities - Centralized room and position helpers
 * Eliminates duplicate utility functions across the codebase
 */
export default class RoomUtils {
    /**
     * Check if coordinates are within room bounds (0-49)
     */
    static isInBounds(x, y) {
        return x >= 0 && x <= 49 && y >= 0 && y <= 49;
    }

    /**
     * Check if a tile is walkable (not a wall and no blocking structures)
     */
    static isWalkableTile(room, x, y) {
        if (!room) return false;
        if (!this.isInBounds(x, y)) return false;

        const terrain = room.getTerrain();
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) return false;

        const structures = room.lookForAt(LOOK_STRUCTURES, x, y);
        for (const s of structures) {
            if (s.structureType === STRUCTURE_ROAD) continue;
            if (s.structureType === STRUCTURE_CONTAINER) continue;
            if (s.structureType === STRUCTURE_RAMPART && (s.my || s.isPublic)) continue;
            return false;
        }

        return true;
    }

    /**
     * Check if a tile is free for construction (walkable + no construction sites)
     */
    static isFreeForConstruction(room, x, y) {
        if (!this.isWalkableTile(room, x, y)) return false;

        const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
        if (sites && sites.length > 0) return false;

        return true;
    }

    /**
     * Count adjacent open/walkable tiles around a position
     */
    static countAdjacentOpenTiles(room, x, y) {
        let open = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (this.isWalkableTile(room, nx, ny)) open++;
            }
        }
        return open;
    }

    /**
     * Generate a position key for caching (x,y format)
     */
    static posKey(pos) {
        return `${pos.x},${pos.y}`;
    }

    /**
     * Get all adjacent positions around a position
     */
    static getAdjacentPositions(pos) {
        const positions = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = pos.x + dx;
                const y = pos.y + dy;
                if (this.isInBounds(x, y)) {
                    positions.push(new RoomPosition(x, y, pos.roomName));
                }
            }
        }
        return positions;
    }

    /**
     * Get adjacent position in a specific direction
     */
    static getAdjacentPosition(pos, direction) {
        const offsets = {
            [TOP]: [0, -1],
            [TOP_RIGHT]: [1, -1],
            [RIGHT]: [1, 0],
            [BOTTOM_RIGHT]: [1, 1],
            [BOTTOM]: [0, 1],
            [BOTTOM_LEFT]: [-1, 1],
            [LEFT]: [-1, 0],
            [TOP_LEFT]: [-1, -1]
        };

        const delta = offsets[direction];
        if (!delta) return null;

        const x = pos.x + delta[0];
        const y = pos.y + delta[1];
        if (!this.isInBounds(x, y)) return null;

        return new RoomPosition(x, y, pos.roomName);
    }

    /**
     * Get controller container plan (container + worker spots + reserved spot)
     * Used by upgrade and build tasks to coordinate upgrader positioning
     */
    static getControllerContainerPlan(room) {
        if (!room || !room.controller) return null;

        const controller = room.controller;
        const containers = controller.pos.findInRange(FIND_STRUCTURES, 2, {
            filter: s => s.structureType === STRUCTURE_CONTAINER
        });
        const container = containers.length > 0 ? containers[0] : null;
        if (!container) return null;

        const spawns = room.find(FIND_MY_SPAWNS);
        const spawnPos = spawns.length > 0 ? spawns[0].pos : null;

        const spots = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const x = container.pos.x + dx;
                const y = container.pos.y + dy;
                if (!this.isWalkableTile(room, x, y)) continue;

                // Must be within upgrade range of controller
                if (controller.pos.getRangeTo(x, y) > 3) continue;

                spots.push(new RoomPosition(x, y, room.name));
            }
        }

        if (spots.length === 0) return { container, reservedSpot: null, workerSpots: [] };

        // Reserve one spot for hauler transfers (closest to spawn)
        let reservedSpot = null;
        if (spawnPos) {
            spots.sort((a, b) => spawnPos.getRangeTo(a) - spawnPos.getRangeTo(b));
            reservedSpot = spots[0];
        } else {
            reservedSpot = spots[0];
        }

        const workerSpots = spots.filter(p => !(reservedSpot && p.x === reservedSpot.x && p.y === reservedSpot.y));

        return { container, reservedSpot, workerSpots };
    }

    /**
     * Pick an upgrade spot for a creep deterministically based on creep name
     * Distributes creeps evenly across available spots
     */
    static pickUpgradeSpotForCreep(creep, workerSpots) {
        if (!creep || !workerSpots || workerSpots.length === 0) return null;

        // Deterministic hash based on creep name
        let hash = 0;
        for (let i = 0; i < creep.name.length; i++) {
            hash = ((hash << 5) - hash) + creep.name.charCodeAt(i);
            hash |= 0;
        }
        let idx = Math.abs(hash) % workerSpots.length;

        // Prefer an unoccupied spot
        for (let i = 0; i < workerSpots.length; i++) {
            const pos = workerSpots[(idx + i) % workerSpots.length];
            const creepsThere = creep.room.lookForAt(LOOK_CREEPS, pos.x, pos.y);
            if (!creepsThere || creepsThere.length === 0) return pos;
        }

        return workerSpots[idx];
    }
}
