import { callRoom } from "@/core/rooms/room.integration.js";
import { HeartbeatWorldGlobalCommand } from "@/rooms/global/global.shared.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** Mỗi ~30 giây: làm mới vị trí các player trong room này ở global (không thì global coi họ là offline). */
export class PartyHeartbeatWorldCommand extends Command<WorldRoom, void> {
    async execute() {
        const room = this.room;
        if (room.state.players.size === 0) return;

        await callRoom(room.serverId, HeartbeatWorldGlobalCommand, {
            worldRoomId: room.roomId,
            mapCode: room.map.code,
            instanceId: room.dungeon?.instanceId,
            playerIds: [...room.state.players.keys()],
        });
    }
}
