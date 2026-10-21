import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyTargetSchema } from "@/rooms/party/modules/members/validators/member.party.validator.js";
import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { PlayerPartyCommand } from "@/rooms/party/commands/player.party.command.js";
import { noticeError } from "@/rooms/party/services/party-notify.js";

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
    note: "Thành công: notice `kicked`.",
})
export class KickPartyCommand extends PlayerPartyCommand<Payload, typeof PartyTargetSchema> {
    static readonly message = PartyClientMessage.KICK;

    protected override readonly validateSchema = PartyTargetSchema;

    validate({ client }: Payload) {
        const targetId = this.body.playerId;
        const error = this.room.state.checkTarget(client.auth.playerId, targetId);
        if (!error) return true;
        noticeError(client, error, this.room.state.nameOf(targetId));
        return false;
    }

    execute() {
        return new RemovePlayerPartyCommand().setPayload({
            playerId: this.body.playerId,
            code: PartyNotice.KICKED,
        });
    }
}
