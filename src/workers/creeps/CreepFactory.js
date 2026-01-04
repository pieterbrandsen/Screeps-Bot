import BaseCreep from "./baseCreep.js";
import Harvester from "./harvester.js";
import Hauler from "./hauler.js";
import Worker from "./worker.js";
import Upgrader from "./upgrader.js";

/**
 * CreepFactory - Factory for getting creep type classes
 * Provides body composition and spawning configuration for different creep types
 */
export default class CreepFactory {
    /**
     * Get creep type class by name
     * @param {string} type - Creep type name ('harvester', 'hauler', 'worker', 'upgrader')
     * @returns {typeof BaseCreep} Creep type class
     */
    static getCreepClass(type) {
        switch (type) {
            case 'harvester':
                return Harvester;
            case 'hauler':
                return Hauler;
            case 'worker':
                return Worker;
            case 'upgrader':
                return Upgrader;
            default:
                return BaseCreep;
        }
    }

    /**
     * Get body composition for creep type
     * @param {string} type - Creep type name
     * @param {number} energy - Available energy
     * @returns {string[]} Array of body parts
     */
    static getBody(type, energy) {
        const CreepClass = this.getCreepClass(type);
        return CreepClass.getBody(energy);
    }

    /**
     * Get creep type from job type
     * @param {string} jobType - Job type ('harvest', 'haul', 'build', 'upgrade')
     * @returns {string} Creep type
     */
    static getCreepTypeFromJobType(jobType) {
        switch (jobType) {
            case 'harvest':
                return 'harvester';
            case 'haul':
                return 'hauler';
            case 'build':
                return 'worker';
            case 'upgrade':
                return 'upgrader';
            default:
                return 'worker'; // Default fallback
        }
    }

    /**
     * Get job types that a creep type can perform
     * @param {string} type - Creep type name
     * @returns {string[]} Array of job type strings
     */
    static getJobTypes(type) {
        const CreepClass = this.getCreepClass(type);
        return CreepClass.getJobTypes();
    }
}
