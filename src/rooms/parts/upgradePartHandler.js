import Constants from '../../utils/constants.js';

export default class UpgradePartHandler {
    constructor(room, jobsRoomPartHandler) {
        this.room = room;
        this.jobsRoomPartHandler = jobsRoomPartHandler;
    }

    getUpgradeJob() {
        return this.jobsRoomPartHandler.getJobById(`${this.room.name}-upgrade-job`);
    }

    _calculateUpgradeWorkParts(energyState) {
        let wantedWorkParts = 1;
        if (energyState === 'abundant') wantedWorkParts = Constants.UPGRADE_WORK_PARTS_ABUNDANT;
        else if (energyState === 'normal') wantedWorkParts = Constants.UPGRADE_WORK_PARTS_NORMAL;
        else if (energyState === 'tight') wantedWorkParts = Constants.UPGRADE_WORK_PARTS_TIGHT;
        else if (energyState === 'startup') wantedWorkParts = Constants.UPGRADE_WORK_PARTS_STARTUP;
        return wantedWorkParts;
    }

    createOrUpdateUpgradeJob(job) {
        if (!this.room.controller || !this.room.controller.my) return;

        const energyState = this.jobsRoomPartHandler.getEnergyState();
        const maxCreepAssignments = 7;
        const wantedWorkParts = this._calculateUpgradeWorkParts(energyState);

        const jobId = `${this.room.name}-upgrade-job`;
        const wanted = {
            WORK: wantedWorkParts,
            CARRY: wantedWorkParts,
            MOVE: wantedWorkParts
        };

        if (!job) {
            this.jobsRoomPartHandler.createJob({
                id: jobId,
                objectId: this.room.controller.id,
                type: 'upgrade',
                creepType: 'worker',
                startRoom: this.room.name,
                capacityType: 'scalable',
                maxCreepAssignments,
                wantedCreepParts: wanted,
                minJobTime: 100
            });
        } else {
            this.jobsRoomPartHandler.updateJob(job.id, {
                objectId: this.room.controller.id,
                maxCreepAssignments,
                wantedCreepParts: wanted
            });
        }
    }

    run() {
        if (!this.room) return;

        const upgradeJob = this.getUpgradeJob();
        this.createOrUpdateUpgradeJob(upgradeJob);
    }
}
