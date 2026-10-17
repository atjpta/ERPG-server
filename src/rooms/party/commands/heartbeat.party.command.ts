import type { PartyRoom } from "@/rooms/party/party.room.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import { Command } from "@colyseus/command";

export class HeartbeatPartyCommand extends Command<PartyRoom> {
    async execute() {
        if (this.room.disbanded) return;
        await Promise.all(
            this.room.state.joinOrder.map((playerId) =>
                partyDirectoryService.setPartyRoomId(playerId, this.room.roomId)
            )
        );
    }
}
