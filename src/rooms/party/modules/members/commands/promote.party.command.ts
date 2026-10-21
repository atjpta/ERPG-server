import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyTargetSchema } from "@/rooms/party/modules/members/validators/member.party.validator.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { PlayerPartyCommand } from "@/rooms/party/commands/player.party.command.js";
import { broadcastNotice, noticeError } from "@/rooms/party/services/party-notify.js";

interface Payload {
    client: PlayerClient;
    payload?: unknown;
}

@SdkMessage({
    replies: [PartyMessage.NOTICE],
    errors: [
        PartyErrorCode.PARTY_NOT_LEADER,
        PartyErrorCode.PARTY_SELF_TARGET,
        PartyErrorCode.PARTY_NOT_MEMBER,
    ],
    note: "Thành công: broadcast notice `leader_changed`.",
})
export class PromotePartyCommand extends PlayerPartyCommand<Payload, typeof PartyTargetSchema> {
    static readonly message = PartyClientMessage.PROMOTE;

    protected override readonly validateSchema = PartyTargetSchema;

    validate({ client }: Payload) {
        const targetId = this.body.playerId;
        const error = this.room.state.checkTarget(client.auth.playerId, targetId);
        if (!error) return true;
        noticeError(client, error, this.room.state.nameOf(targetId));
        return false;
    }

    execute({ client }: Payload) {
        this.room.state.promote(client.auth.playerId, this.body.playerId);
        broadcastNotice(
            this.room,
            PartyNotice.LEADER_CHANGED,
            this.room.state.nameOf(this.body.playerId)
        );
    }
}
