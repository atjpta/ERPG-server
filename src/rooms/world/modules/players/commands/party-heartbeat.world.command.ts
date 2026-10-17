import { partyDirectoryService } from "@/rooms/party/party.shared.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

export class PartyHeartbeatWorldCommand extends Command<WorldRoom, void> {
    async execute() {
        const room = this.room;

        await Promise.all(
            [...room.state.players.values()].map(async (player) => {
                await partyDirectoryService.setWorldRoomId(player.id, room.roomId);
            })
        );
    }
}
