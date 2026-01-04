import SourcesPartHandler from "../parts/sourcesPartHandler.js";
import SpawningPartHandler from "../parts/spawningPartHandler.js";
import HaulingPartHandler from "../parts/haulingPartHandler.js";
import BuildingPartHandler from "../parts/buildingPartHandler.js";
import UpgradePartHandler from "../parts/upgradePartHandler.js";
import VisualsPartHandler from "../visualization/visualsPartHandler.js";
import JobsRoomPartHandler from "../parts/jobsPartHandler.js";
import PredictingPartHandler from "../parts/predictingPartHandler.js";

export default class OwnedRoomHandler {
    static run(room) {
        const sources = room.find(FIND_SOURCES);
        const spawns = room.find(FIND_MY_SPAWNS);

        // Create JobsRoomPartHandler instance for this room
        const jobsRoomPartHandler = new JobsRoomPartHandler(room);

        // Create PredictingPartHandler instance for this room
        const predictingRoomPartHandler = new PredictingPartHandler(room, jobsRoomPartHandler);

        // Run source harvesting job management
        for (const source of sources) {
            new SourcesPartHandler(source, room, jobsRoomPartHandler).run();
        }

        // Run hauling job management (once per room)
        new HaulingPartHandler(room, jobsRoomPartHandler).run();

        // Run upgrade job management (once per room)
        new UpgradePartHandler(room, jobsRoomPartHandler).run();

        // Run building logic so construction-driven jobs can influence spawning this tick.
        // new BuildingPartHandler(room, jobsRoomPartHandler).run();

        // Run spawning logic
        for (const spawn of spawns) {
            new SpawningPartHandler(room, spawn, jobsRoomPartHandler, predictingRoomPartHandler).run();
        }

        // Update all job ETAs
        predictingRoomPartHandler.updateJobETAs();

        // Draw room visuals
        new VisualsPartHandler(room, jobsRoomPartHandler, predictingRoomPartHandler).run();

        // Logic for handling owned rooms goes here
    }
}