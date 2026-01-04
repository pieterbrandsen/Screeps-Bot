import NoneRoomHandler from "./noneRoomHandler.js";
import OwnedRoomHandler from "./ownedRoomHandler.js";

export default class RoomTypeManager {
    static getType(room) {
        let roomType = "none";

        if (room.controller && room.controller.my) {
            roomType = "owned";
        }

        return roomType;
    }

    static run(room, type) {
        switch (type) {
            case "owned":
                OwnedRoomHandler.run(room);
                break;
            case "none":
                NoneRoomHandler.run(room);
                break;
        }
    }
}