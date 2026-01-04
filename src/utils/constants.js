/**
 * Game Constants - Centralized mapping of game constants and utilities
 * Provides consistent access to Screeps constants and metadata
 */
export default class Constants {
    // Spawning constants
    static WAIT_WINDOW_TICKS = 30;
    static MIN_ENERGY_FRACTION_TO_WAIT = 0.7;

    // Body part costs
    static UNIT_COST_WCM = 200; // WORK(100) + CARRY(50) + MOVE(50)
    static BASE_NON_WORK_COST = 100; // 1 CARRY(50) + 1 MOVE(50)
    static BASE_NON_WORK_PARTS = 2; // 1 CARRY + 1 MOVE
    static WORK_PART_COST = 100;

    // Travel and pathfinding
    static MAX_PATH_COMPUTES = 10;
    static PATHFINDER_MAX_OPS = 2500;
    static PLAIN_COST = 2;
    static SWAMP_COST = 10;
    static INTERACTION_OVERHEAD = 4;

    // Room and structure limits
    static MAX_CREEP_PARTS = 50;
    static MAX_STRUCTURE_SEARCH_RANGE = 6;

    // Energy thresholds
    static MIN_SPAWN_ENERGY = 200;
    static ABUNDANT_STORAGE_THRESHOLD = 100000;
    static NORMAL_STORAGE_THRESHOLD = 10000;
    static ABUNDANT_SPAWN_FRACTION = 0.9;

    // Build energy per tick targets (each WORK part = 5 energy/tick)
    static BUILD_ENERGY_PER_TICK_BASE = 10;       // 2 WORK parts
    static BUILD_ENERGY_PER_TICK_STARTUP = 2.5;   // 1 WORK part
    static BUILD_ENERGY_PER_TICK_TIGHT = 5;       // 1 WORK part
    static BUILD_ENERGY_PER_TICK_NORMAL = 15;     // 3 WORK parts
    static BUILD_ENERGY_PER_TICK_ABUNDANT = 20;   // 4 WORK parts

    // Upgrade work parts by energy state
    static UPGRADE_WORK_PARTS_STARTUP = 1;
    static UPGRADE_WORK_PARTS_TIGHT = 2;
    static UPGRADE_WORK_PARTS_NORMAL = 5;
    static UPGRADE_WORK_PARTS_ABUNDANT = 10;

    /**
     * Map job type to emoji icon for visualization
     */
    static getJobIcon(jobType) {
        const icons = {
            'harvest': '⛏️',
            'haul': '🚚',
            'build': '🔨',
            'upgrade': '⚡'
        };
        return icons[jobType] || '❓';
    }

    /**
     * Map part type string to Screeps constant
     */
    static getPartConstant(partType) {
        const normalized = partType ? String(partType).toUpperCase() : null;
        if (!normalized) return null;

        const map = {
            'WORK': WORK,
            'CARRY': CARRY,
            'MOVE': MOVE,
            'TOUGH': TOUGH,
            'ATTACK': ATTACK,
            'RANGED_ATTACK': RANGED_ATTACK,
            'HEAL': HEAL,
            'CLAIM': CLAIM
        };

        return map[normalized] || null;
    }

    /**
     * Get the energy cost of a body part
     */
    static getPartCost(partType) {
        const normalized = partType ? String(partType).toUpperCase() : null;
        if (!normalized) return 0;

        const costs = {
            'WORK': 100,
            'CARRY': 50,
            'MOVE': 50,
            'TOUGH': 10,
            'ATTACK': 80,
            'RANGED_ATTACK': 150,
            'HEAL': 250,
            'CLAIM': 600
        };

        return costs[normalized] || 0;
    }

    /**
     * Get base creep part counts for a job type
     */
    static getBaseCreepPartsForJob(jobType) {
        const baseParts = {
            'harvest': { WORK: 1, CARRY: 1, MOVE: 1 },
            'haul': { CARRY: 1, MOVE: 1 },
            'build': { WORK: 1, CARRY: 1, MOVE: 1 },
            'upgrade': { WORK: 1, CARRY: 1, MOVE: 1 }
        };

        return baseParts[jobType] || { WORK: 1, CARRY: 1, MOVE: 1 };
    }

    /**
     * Normalize part type key to uppercase
     */
    static normalizePartKey(key) {
        if (!key) return null;
        return String(key).toUpperCase();
    }
}
