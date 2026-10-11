import { defineRoom } from "colyseus";
import { PartyRoom } from "@/rooms/party/party.room.js";
import { WorldRoom } from "@/rooms/world/world.room.js";

export const createRooms = () => ({
    world: defineRoom(WorldRoom).filterBy(["mapCode"]),
    // Mỗi lượt dungeon là 1 instance riêng (`instanceId` do server cấp qua `mapChange`).
    dungeon: defineRoom(WorldRoom).filterBy(["instanceId"]),
    // Mỗi party là một room riêng, tạo từ server (`matchMaker.createRoom`) và vào bằng `joinById`.
    party: defineRoom(PartyRoom),
});
