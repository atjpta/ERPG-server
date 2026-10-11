import { defineRoom } from "colyseus";
import { WorldRoom } from "@/rooms/world/world.room.js";

export const createRooms = () => ({
    world: defineRoom(WorldRoom).filterBy(["mapCode"]),
    // Mỗi lượt dungeon là 1 instance riêng (`instanceId` do server cấp qua `mapChange`).
    dungeon: defineRoom(WorldRoom).filterBy(["instanceId"]),
});
