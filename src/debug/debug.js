export default class Debug {
    static _getLevelMap() {
        return {
            off: 0,
            error: 1,
            warn: 2,
            info: 3,
            debug: 4,
            trace: 5
        };
    }

    static _normalizeLevel(level) {
        if (!level) return 'off';
        const str = String(level).toLowerCase();
        const map = this._getLevelMap();
        if (map[str] !== undefined) return str;
        return 'off';
    }

    static _ensureMemory() {
        if (!Memory.debug) {
            Memory.debug = {
                level: 'warn',
                hud: true,
                rooms: Object.create(null),
                roomHud: Object.create(null),
                throttle: Object.create(null)
            };
        }

        if (!Memory.debug.rooms) Memory.debug.rooms = Object.create(null);
        if (Memory.debug.hud === undefined) Memory.debug.hud = true;
        if (!Memory.debug.roomHud) Memory.debug.roomHud = Object.create(null);
        if (!Memory.debug.throttle) Memory.debug.throttle = Object.create(null);
        if (!Memory.debug.level) Memory.debug.level = 'warn';

        return Memory.debug;
    }

    static getConfig() {
        return this._ensureMemory();
    }

    static getEffectiveLevel(roomName) {
        const cfg = this._ensureMemory();
        const map = this._getLevelMap();
        const globalLevel = this._normalizeLevel(cfg.level);
        const roomLevel = roomName && cfg.rooms && cfg.rooms[roomName] ? this._normalizeLevel(cfg.rooms[roomName]) : null;
        const effective = roomLevel || globalLevel;
        return { name: effective, value: map[effective] };
    }

    static setGlobalLevel(level) {
        const cfg = this._ensureMemory();
        cfg.level = this._normalizeLevel(level);
        return cfg.level;
    }

    static setRoomLevel(roomName, level) {
        if (!roomName) return false;
        const cfg = this._ensureMemory();
        cfg.rooms[roomName] = this._normalizeLevel(level);
        return true;
    }

    static clearRoomLevel(roomName) {
        if (!roomName) return false;
        const cfg = this._ensureMemory();
        if (cfg.rooms) delete cfg.rooms[roomName];
        return true;
    }

    static setHudEnabled(enabled) {
        const cfg = this._ensureMemory();
        cfg.hud = !!enabled;
        return cfg.hud;
    }

    static setRoomHudEnabled(roomName, enabled) {
        if (!roomName) return false;
        const cfg = this._ensureMemory();
        cfg.roomHud[roomName] = !!enabled;
        return true;
    }

    static isHudEnabled(roomName) {
        const cfg = this._ensureMemory();
        if (roomName && cfg.roomHud && cfg.roomHud[roomName] !== undefined) {
            return !!cfg.roomHud[roomName];
        }
        return !!cfg.hud;
    }

    static startTick() {
        if (this._tick === Game.time) return;

        this._tick = Game.time;
        this._buffer = Object.create(null); // roomName -> array of lines
        this._counts = Object.create(null); // roomName -> { key: n }
    }

    static count(roomName, key, delta = 1) {
        this.startTick();
        const rn = roomName || 'global';
        if (!this._counts[rn]) this._counts[rn] = Object.create(null);
        this._counts[rn][key] = (this._counts[rn][key] || 0) + delta;
    }

    static getCounts(roomName) {
        this.startTick();
        const rn = roomName || 'global';
        return (this._counts && this._counts[rn]) ? this._counts[rn] : Object.create(null);
    }

    static shouldLog(roomName, level) {
        const wanted = this._normalizeLevel(level);
        const map = this._getLevelMap();
        const eff = this.getEffectiveLevel(roomName);
        return map[wanted] <= eff.value && eff.value > 0;
    }

    static throttle(key, everyTicks, roomName) {
        const cfg = this._ensureMemory();
        const throttleKey = roomName ? `${roomName}:${key}` : String(key);
        const last = cfg.throttle[throttleKey];
        if (last === undefined || last === null || Game.time - last >= everyTicks) {
            cfg.throttle[throttleKey] = Game.time;
            return true;
        }
        return false;
    }

    static _safeStringify(obj) {
        if (obj === undefined) return '';
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return '[unstringifiable]';
        }
    }

    static log(roomName, level, message, data) {
        this.startTick();

        const rn = roomName || 'global';
        if (!this.shouldLog(rn, level)) return;

        if (!this._buffer[rn]) this._buffer[rn] = [];

        const lvl = this._normalizeLevel(level).toUpperCase();
        const suffix = data !== undefined ? ` ${this._safeStringify(data)}` : '';
        this._buffer[rn].push(`[${lvl}] ${message}${suffix}`);
    }

    static flush() {
        this.startTick();

        const effectiveGlobal = this.getEffectiveLevel(null);
        if (effectiveGlobal.value <= 0) return;

        const rooms = Object.keys(this._buffer || Object.create(null));
        for (const roomName of rooms) {
            const lines = this._buffer[roomName];
            if (!lines || lines.length === 0) continue;

            if (!this.shouldLog(roomName, 'error')) continue;

            console.log(`=== DEBUG ${roomName} @${Game.time} (${lines.length} lines) ===`);
            for (const line of lines) {
                console.log(line);
            }
        }

        // Clear buffers after flush
        this._buffer = Object.create(null);
    }

    static status() {
        const cfg = this._ensureMemory();
        return {
            level: cfg.level,
            hud: cfg.hud,
            rooms: cfg.rooms || Object.create(null),
            roomHud: cfg.roomHud || Object.create(null)
        };
    }

    static clear() {
        if (Memory.debug) {
            delete Memory.debug;
        }
        this._buffer = Object.create(null);
        this._counts = Object.create(null);
    }
}
