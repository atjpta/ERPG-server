import { callRoom } from "@/core/rooms/room.integration.js";
import { AttachWorldGlobalCommand } from "@/rooms/global/global.shared.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/** Player vừa vào world room này: báo global vị trí, và nhận lại party (nếu có) của họ. */
export class PartyAttachWorldCommand extends Command<WorldRoom, { player: PlayerWorldState }> {
    async execute({ player }: { player: PlayerWorldState }) {
        const room = this.room;

        const attached = await callRoom(room.serverId, AttachWorldGlobalCommand, {
            worldRoomId: room.roomId,
            mapCode: room.map.code,
            instanceId: room.dungeon?.instanceId,
            playerId: player.id,
        });
        // RPC lỗi hoặc không ở party nào: world giữ nguyên, lần heartbeat / report sau đối soát.
        if (!attached.success || !attached.data) return;
        player.applyPartySnapshot(attached.data);
    }
}
