import HarvestTask from "./harvestTask.js";
import PickupTask from "./pickupTask.js";
import DeliveryTask from "./deliveryTask.js";
import BuildTask from "./buildTask.js";
import UpgradeTask from "./upgradeTask.js";
import MoveTask from "./moveTask.js";

/**
 * Tasks Manager - Central registry for all creep task executors
 * Routes job execution to the appropriate task handler based on job type
 */
export default class TasksManager {
    /**
     * Execute a task for a creep based on the job type
     * @param {Creep} creep - The creep performing the task
     * @param {Object} job - The job object containing task details
     * @returns {boolean} True if task is complete, false otherwise
     */
    static executeTask(creep, job) {
        if (!creep || !job || !job.type) {
            return false;
        }

        switch (job.type) {
            case 'move':
                return MoveTask.execute(creep, job);

            case 'harvest':
                return HarvestTask.execute(creep, job);

            case 'pickup':
                return PickupTask.execute(creep, job);

            case 'delivery':
                return DeliveryTask.execute(creep, job);

            case 'build':
                return BuildTask.execute(creep, job);

            case 'upgrade':
                return UpgradeTask.execute(creep, job);

            default:
                creep.say('❓');
                return false;
        }
    }

    /**
     * Get list of all supported task types
     * @returns {string[]} Array of supported task type names
     */
    static getSupportedTaskTypes() {
        return ['move', 'harvest', 'pickup', 'delivery', 'build', 'upgrade'];
    }

    /**
     * Check if a task type is supported
     * @param {string} taskType - The task type to check
     * @returns {boolean} True if supported, false otherwise
     */
    static isTaskTypeSupported(taskType) {
        return this.getSupportedTaskTypes().includes(taskType);
    }

    /**
     * Execute a specific task by name with options
     * Useful for multi-task jobs that need to execute tasks in sequence
     * @param {Creep} creep - The creep performing the task
     * @param {string} taskType - The task type to execute
     * @param {Object} job - The job object
     * @param {Object} options - Task-specific options
     * @returns {boolean} True if task is complete, false otherwise
     */
    static executeTaskByType(creep, taskType, job, options = {}) {
        switch (taskType) {
            case 'move':
                return MoveTask.execute(creep, job, options);
            case 'harvest':
                return HarvestTask.execute(creep, job);
            case 'pickup':
                return PickupTask.execute(creep, job);
            case 'delivery':
                return DeliveryTask.execute(creep, job);
            case 'build':
                return BuildTask.execute(creep, job);
            case 'upgrade':
                return UpgradeTask.execute(creep, job);
            default:
                return false;
        }
    }
}
