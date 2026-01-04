import MoveTask from "./moveTask.js";
import RoomUtils from "../../utils/roomUtils.js";
import TaskUtils from "../../utils/taskUtils.js";

/**
 * Build task - Constructs buildings at construction sites
 */
export default class BuildTask {
    /**
     * Execute build task for a creep
     * @param {Creep} creep - The creep performing the build
     * @param {Object} job - The build job object
     * @returns {boolean} True if job is complete, false otherwise (build jobs are persistent)
     */
    static execute(creep, job) {
        // Get the specific construction site for this job
        const site = Game.getObjectById(job.objectId);

        if (!site) {
            // Construction site no longer exists - job complete
            creep.say('✅');
            return true;
        }

        // If empty, move to build position and wait for haulers
        const buildResult = creep.build(site);
        if (buildResult === ERR_NOT_IN_RANGE) {
            MoveTask.execute(creep, job, { range: 3, target: site });
            creep.say('🔨');
        } else if (buildResult === OK) {
            creep.say('🔨');
        } else if (buildResult === ERR_INVALID_TARGET) {
            // Site completed
            creep.say('✅');
            return true;
        }
        else if (buildResult === ERR_NOT_ENOUGH_RESOURCES) {
            creep.say('⏳');
        } else {
            // Some other error
            creep.say('❌');
        }

        return false;
    }
}
