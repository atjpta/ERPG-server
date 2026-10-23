import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import {
    PartyMemberGlobalCommand,
    type PartyCommandPayload,
} from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { PartyTargetSchema } from "@/rooms/global/modules/party/validators/member.party.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { PartyErrorCode } from "@/modules/party/enums/party-error-code.enum.js";

@SdkMessage({
    errors: [
        PartyErrorCode.PARTY_NOT_MEMBER,
        PartyErrorCode.PARTY_NOT_LEADER,
        PartyErrorCode.PARTY_SELF_TARGET,
    ],
    note: "Thành công: mọi thành viên nhận notice `leader_changed` và `partyState` mới. Lỗi có `error.playerName`.",
})
export class PartyPromoteGlobalCommand extends PartyMemberGlobalCommand<typeof PartyTargetSchema> {
    static readonly message = GlobalClientMessage.PARTY_PROMOTE;

    protected override readonly validateSchema = PartyTargetSchema;
    protected override readonly leaderOnly = true;

    execute({ client }: PartyCommandPayload) {
        const { room, party } = this;
        const targetId = this.body.playerId;
        const promoted = party.promote(client.auth.playerId, targetId);
        if (Response.isError(promoted)) {
            this.result = Response.error(promoted.errorCode, {
                playerName: party.getMemberName(targetId),
            });
            return;
        }
        partyNotifyGlobalService.broadcastNotice(
            room,
            party,
            PartyNotice.LEADER_CHANGED,
            party.getMemberName(targetId)
        );
        partyNotifyGlobalService.broadcastState(room, party);
        this.result = Response.success();
    }
}
