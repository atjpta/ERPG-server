import { callRoom } from "@/core/rooms/room.integration.js";
import { DetachWorldPartyCommand } from "@/rooms/party/commands/detach-world.party.command.js";
import { RemoveMemberPartyCommand } from "@/rooms/party/modules/members/commands/remove-member.party.command.js";
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
            await callRoom(partyRoomId, DetachWorldPartyCommand, {
                playerId: player.id,
                worldRoomId: room.roomId,
            });
        } else {
            await callRoom(partyRoomId, RemoveMemberPartyCommand, {
                playerId: player.id,
                worldRoomId: room.roomId,
            });
        }
    }
}
