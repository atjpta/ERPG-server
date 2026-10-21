import { defineRoom } from "colyseus";
import { WorldRoom } from "@/rooms/world/world.room.js";
import { ChatRoom } from "@/rooms/chat/chat.room.js";
import { PartyRoom } from "@/rooms/party/party.room.js";

export const createRooms = () => {
    return {
        world: defineRoom(WorldRoom).filterBy(["mapCode"]),
        // Mỗi lượt dungeon là 1 instance riêng (`instanceId` do server cấp qua `mapChange`).
        dungeon: defineRoom(WorldRoom).filterBy(["instanceId"]),
        // Mỗi party là một room riêng, tạo từ server (`matchMaker.createRoom`) và vào bằng `joinById`.
        party: defineRoom(PartyRoom),
        // Mỗi server một chat room (kênh world / map / party / whisper nằm trong room): `joinOrCreate("chat", { serverId })`.
        chat: defineRoom(ChatRoom).filterBy(["serverId"]),
    };
};
