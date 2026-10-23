import { callRoom } from "@/core/rooms/room.integration.js";
import { DetachWorldGlobalCommand } from "@/rooms/global/global.shared.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

/**
 * Player rời world room này: báo global bỏ vị trí của họ nếu vẫn trỏ về room này. `changingMap` (đã bước vào
 * portal / vào-ra dungeon, đang chờ vào room mới) khác với rời hẳn (thoát, mất kết nối, bị đá): rời hẳn thì global
 * cho họ ra khỏi party luôn.
 */
export class PartyDetachWorldCommand extends Command<WorldRoom, { player: PlayerWorldState }> {
    async execute({ player }: { player: PlayerWorldState }) {
        const room = this.room;

        await callRoom(room.serverId, DetachWorldGlobalCommand, {
            playerId: player.id,
            worldRoomId: room.roomId,
            changingMap: player.pendingMapCode !== undefined,
        });
    }
}
