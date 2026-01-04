import JobsManager from "../jobs/jobsManager.js";

/**
 * Job Creation Utilities - Common helper functions for creating/updating jobs in room parts
 */
export default class JobCreationUtils {
    /**
     * Create or update a job in the room's job list
     * If a job with the same jobId exists, it's updated; otherwise, a new job is created
     * @param {string} roomName - The room name
     * @param {string} jobId - Unique identifier for the job
     * @param {Object} jobData - Job properties (type, targetId, maxAssignments, priority, etc.)
     * @returns {Object} The created or updated job
     */
    static createOrUpdateJob(roomName, jobId, jobData) {
        const existingJob = JobsManager.getJob(jobId);

        if (existingJob) {
            // Update existing job
            JobsManager.updateJob(jobId, jobData);
            return JobsManager.getJob(jobId);
        } else {
            // Create new job
            return JobsManager.createJob({
                jobId: jobId,
                roomName: roomName,
                ...jobData
            });
        }
    }

    /**
     * Create a standardized jobId for harvest jobs
     * @param {string} roomName - The room name
     * @param {string} sourceId - The source ID
     * @returns {string} Formatted jobId like "harvest-W1N1-5bbcabb69099fc01202e345"
     */
    static getHarvestJobId(roomName, sourceId) {
        return `harvest-${roomName}-${sourceId}`;
    }

    /**
     * Create a standardized jobId for haul jobs
     * @param {string} roomName - The room name
     * @param {string} targetId - The target ID
     * @param {string} suffix - Optional suffix for specialized haul jobs
     * @returns {string} Formatted jobId like "haul-W1N1-5bbcabb69099fc01202e345"
     */
    static getHaulJobId(roomName, targetId, suffix = '') {
        const base = `haul-${roomName}-${targetId}`;
        return suffix ? `${base}-${suffix}` : base;
    }

    /**
     * Create a standardized jobId for build jobs
     * @param {string} roomName - The room name
     * @returns {string} Formatted jobId like "build-W1N1"
     */
    static getBuildJobId(roomName) {
        return `build-${roomName}`;
    }

    /**
     * Create a standardized jobId for upgrade jobs
     * @param {string} roomName - The room name
     * @returns {string} Formatted jobId like "upgrade-W1N1"
     */
    static getUpgradeJobId(roomName) {
        return `upgrade-${roomName}`;
    }

    /**
     * Delete a job if it exists
     * @param {string} jobId - The job ID to delete
     * @returns {boolean} True if job was deleted, false if it didn't exist
     */
    static deleteJobIfExists(jobId) {
        const job = JobsManager.getJob(jobId);
        if (job) {
            JobsManager.deleteJob(jobId);
            return true;
        }
        return false;
    }
}
