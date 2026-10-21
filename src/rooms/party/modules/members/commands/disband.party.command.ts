import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { PlayerPartyCommand } from "@/rooms/party/commands/player.party.command.js";
import { releasePlayer } from "@/rooms/party/services/party-membership.js";
import { broadcastNotice, noticeError } from "@/rooms/party/services/party-notify.js";

@SdkMessage({
    replies: [PartyMessage.NOTICE],
    errors: [PartyErrorCode.PARTY_NOT_LEADER],
    note: "Thành công: broadcast notice `disbanded`.",
})
export class DisbandPartyCommand extends PlayerPartyCommand<{ client: PlayerClient }> {
    static readonly message = PartyClientMessage.DISBAND;

    validate({ client }: { client: PlayerClient }) {
        if (this.room.state.isLeader(client.auth.playerId)) return true;
        noticeError(client, PartyErrorCode.PARTY_NOT_LEADER);
        return false;
    }

    async execute() {
        this.room.disbanded = true;
        broadcastNotice(this.room, PartyNotice.DISBANDED);
        for (const playerId of this.room.state.joinOrder) {
            await releasePlayer(this.room, playerId);
        }
        this.room.clients.forEach((c) => c.leave());
        void this.room.disconnect();
    }
}
