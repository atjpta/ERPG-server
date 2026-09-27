import { defineRoom } from "colyseus";
import { WorldRoom } from "@/rooms/world/world.room.js";

export const createRooms = () => ({
    world: defineRoom(WorldRoom).filterBy(["mapCode"]),
});
