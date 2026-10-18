import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

export class OnLeavePartyCommand extends Command<PartyRoom, { client: PlayerClient }> {
    async execute({ client }: { client: PlayerClient }) {
        await this.room.unregisterPlayer(client);
        // Không allowReconnection: rớt kết nối là rời party ngay.
        if (this.room.sessionOf.get(client.auth.playerId) !== client.sessionId) return;
        return new RemovePlayerPartyCommand().setPayload({
            playerId: client.auth.playerId,
            code: PartyNotice.MEMBER_LEFT,
            kickSocket: false,
        });
    }
}
