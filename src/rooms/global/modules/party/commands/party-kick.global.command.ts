import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import {
    PartyMemberGlobalCommand,
    type PartyCommandPayload,
} from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { PartyTargetSchema } from "@/rooms/global/modules/party/validators/member.party.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { PartyErrorCode } from "@/rooms/runtime/modules/party/enums/party-error-code.enum.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

@SdkMessage({
    errors: [
        PartyErrorCode.PARTY_NOT_MEMBER,
        PartyErrorCode.PARTY_NOT_LEADER,
        PartyErrorCode.PARTY_SELF_TARGET,
    ],
    note: "Thành công: thành viên còn lại nhận notice `kicked`; người bị đá nhận `partyLeft`. Lỗi có `error.playerName`.",
})
export class PartyKickGlobalCommand extends PartyMemberGlobalCommand<typeof PartyTargetSchema> {
    static readonly message = GlobalClientMessage.PARTY_KICK;

    protected override readonly validateSchema = PartyTargetSchema;
    protected override readonly leaderOnly = true;

    execute({ client }: PartyCommandPayload) {
        const { party } = this;
        const targetId = this.body.playerId;
        const error = party.checkTarget(client.auth.playerId, targetId);
        if (error) {
            this.result = Response.error(error, undefined, {
                playerName: party.getMemberName(targetId),
            });
            return;
        }
        partyGlobalService.removeMember(this.room, party, targetId, PartyNotice.KICKED);
        this.result = Response.success();
    }
}
