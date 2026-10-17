import { partyRoomRemote } from "@/rooms/party/party.remote.js";
import { partyDirectoryService } from "@/rooms/party/party.shared.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

export class PartyDetachWorldCommand extends Command<WorldRoom, { player: PlayerWorldState }> {
    async execute({ player }: { player: PlayerWorldState }) {
        const room = this.room;

        await partyDirectoryService.clearWorldRoomId(player.id, room.roomId);
        const partyRoomId = player.partyRoomId;
        if (!partyRoomId) return;
        if (player.pendingMapCode) {
            await partyRoomRemote(partyRoomId).detachWorld(player.id, room.roomId);
        } else {
            await partyRoomRemote(partyRoomId).removeMember(player.id, room.roomId);
        }
    }
}
