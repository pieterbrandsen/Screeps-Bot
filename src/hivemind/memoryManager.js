export default class MemoryManager {
    static resetMemory() {
        console.log("Resetting Memory...");
        Memory.jobs = {};
        Memory.initialized = true;
    }

    static run() {
        if (!Memory.initialized) {
            this.resetMemory();
        }

        if (Game.time % 100 === 0) {
            for (const roomName in Memory.jobs) {
                if (Memory.jobs[roomName].length === 0) {
                    delete Memory.jobs[roomName];
                }
            }
        }
    }
}