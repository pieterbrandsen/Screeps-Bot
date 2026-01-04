import RoomTypeManager from "./types/roomTypeManager.js";

export default class RoomsManager {
    static run() {
        const rooms = Object.entries(Game.rooms);
        for (const [name, room] of rooms) {
            const roomType = RoomTypeManager.getType(room);
            RoomTypeManager.run(room, roomType);
        }
    }
}