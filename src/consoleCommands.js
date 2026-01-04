/**
 * Console Commands for Screeps
 * 
 * Usage in Screeps console:
 * - resetMemory() - Clear all memory
 * - killAllCreeps() - Kill all your creeps
 * - help() - Show available commands
 */

import Debug from './debug/debug.js';

class ConsoleCommands {
    static initialize() {
        global.resetMemory = this.resetMemory.bind(this);
        global.killAllCreeps = this.killAllCreeps.bind(this);
        global.clearConstructionSites = this.clearConstructionSites.bind(this);
        global.help = this.help.bind(this);

        global.debugOn = this.debugOn.bind(this);
        global.debugOff = this.debugOff.bind(this);
        global.debugLevel = this.debugLevel.bind(this);
        global.debugRoom = this.debugRoom.bind(this);
        global.debugRoomOff = this.debugRoomOff.bind(this);
        global.debugHud = this.debugHud.bind(this);
        global.debugHudRoom = this.debugHudRoom.bind(this);
        global.debugStatus = this.debugStatus.bind(this);
        global.debugClear = this.debugClear.bind(this);
    }

    static resetMemory() {
        console.log('Resetting memory...');
        for (let key in Memory) {
            delete Memory[key];
        }
        console.log('Memory has been reset!');
        return 'Memory reset complete';
    }

    static killAllCreeps() {
        console.log('Killing all creeps...');
        let count = 0;
        for (let name in Game.creeps) {
            Game.creeps[name].suicide();
            count++;
        }
        console.log(`Killed ${count} creep(s)`);
        return `Killed ${count} creep(s)`;
    }

    static clearConstructionSites() {
        console.log('Clearing all construction sites...');
        let count = 0;
        for (let roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
            for (let site of sites) {
                site.remove();
                count++;
            }
        }
        console.log(`Cleared ${count} construction site(s)`);
        return `Cleared ${count} construction site(s)`;
    }

    static help() {
        console.log('Available Console Commands:');
        console.log('- resetMemory()    : Clear all memory');
        console.log('- killAllCreeps()  : Kill all your creeps');
        console.log('- clearConstructionSites() : Remove all construction sites');
        console.log('- help()           : Show this help message');
        console.log('- debugOn(level?)  : Enable debug logs (default: info)');
        console.log('- debugOff()       : Disable debug logs');
        console.log('- debugLevel(lvl)  : Set global debug level');
        console.log('- debugRoom(r,lvl) : Set room debug level');
        console.log('- debugRoomOff(r)  : Clear room debug override');
        console.log('- debugHud(on)     : Enable/disable HUD globally');
        console.log('- debugHudRoom(r,on): Enable/disable HUD per room');
        console.log('- debugStatus()    : Print current debug config');
        console.log('- debugClear()     : Clear debug config');
        return 'Commands listed above';
    }

    static debugOn(level) {
        const applied = Debug.setGlobalLevel(level || 'info');
        return `Debug enabled: ${applied}`;
    }

    static debugOff() {
        const applied = Debug.setGlobalLevel('off');
        return `Debug disabled: ${applied}`;
    }

    static debugLevel(level) {
        const applied = Debug.setGlobalLevel(level);
        return `Debug level: ${applied}`;
    }

    static debugRoom(roomName, level) {
        Debug.setRoomLevel(roomName, level || 'info');
        return `Room ${roomName} debug: ${Debug.getEffectiveLevel(roomName).name}`;
    }

    static debugRoomOff(roomName) {
        Debug.clearRoomLevel(roomName);
        return `Room ${roomName} debug override cleared`;
    }

    static debugHud(enabled) {
        const applied = Debug.setHudEnabled(enabled === undefined ? true : enabled);
        return `HUD: ${applied ? 'on' : 'off'}`;
    }

    static debugHudRoom(roomName, enabled) {
        Debug.setRoomHudEnabled(roomName, enabled === undefined ? true : enabled);
        return `HUD ${roomName}: ${Debug.isHudEnabled(roomName) ? 'on' : 'off'}`;
    }

    static debugStatus() {
        const status = Debug.status();
        console.log('Debug status:', JSON.stringify(status));
        return status;
    }

    static debugClear() {
        Debug.clear();
        return 'Debug cleared';
    }
}

export default ConsoleCommands;
