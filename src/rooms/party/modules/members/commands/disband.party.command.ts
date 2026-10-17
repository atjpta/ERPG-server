import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyClientMessage, PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { releasePlayer } from "@/rooms/party/services/party-membership.js";
import { broadcastNotice, notice } from "@/rooms/party/services/party-notify.js";

export class DisbandPartyCommand extends Command<PartyRoom, { client: PlayerClient }> {
    static readonly message = PartyClientMessage.DISBAND;

    async execute({ client }: { client: PlayerClient }) {
        if (!this.room.state.isLeader(client.auth.playerId)) {
            return notice(client, PartyNoticeCode.NOT_LEADER);
        }
        this.room.disbanded = true;
        broadcastNotice(this.room, PartyNoticeCode.DISBANDED);
        for (const playerId of this.room.state.joinOrder) {
            await releasePlayer(this.room, playerId);
        }
        this.room.clients.forEach((c) => c.leave());
        void this.room.disconnect();
    }
}
