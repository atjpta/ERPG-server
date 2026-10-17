import { partyRoomRemote } from "@/rooms/party/party.remote.js";
import { partyDirectoryService } from "@/rooms/party/party.shared.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

export class PartyAttachWorldCommand extends Command<WorldRoom, { player: PlayerWorldState }> {
    async execute({ player }: { player: PlayerWorldState }) {
        const room = this.room;

        await partyDirectoryService.setWorldRoomId(player.id, room.roomId);
        const partyRoomId = await partyDirectoryService.getPartyRoomId(player.id);
        if (!partyRoomId) return;
        const snapshot = await partyRoomRemote(partyRoomId).attachWorld(
            player.id,
            room.roomId,
            playerPartyWorldService.toMemberInfo(room, player)
        );
        // RPC lỗi hoặc không còn là thành viên: giữ directory để lần sau đối soát.
        if (!snapshot) return;
        playerPartyWorldService.applySnapshot(room, player, snapshot);
    }
}
