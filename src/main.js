import HivemindManager from './hivemind/hivemindManager.js';
import MoveManager from './hivemind/moveManager.js';
import RoomsManager from './rooms/roomsManager.js';
import WorkersManager from './workers/workersManager.js';
import ConsoleCommands from './consoleCommands.js';
import Debug from './debug/debug.js';

ConsoleCommands.killAllCreeps();
ConsoleCommands.clearConstructionSites();
ConsoleCommands.resetMemory();
ConsoleCommands.initialize();

module.exports.loop = function () {
    Debug.startTick();
    MoveManager.startTick();
    HivemindManager.run();
    RoomsManager.run();

    WorkersManager.run();

    Debug.flush();
}