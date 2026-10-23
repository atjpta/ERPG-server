import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import {
    PartyMemberGlobalCommand,
    type PartyCommandPayload,
} from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { PartyErrorCode } from "@/modules/party/enums/party-error-code.enum.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

@SdkMessage({
    errors: [PartyErrorCode.PARTY_NOT_MEMBER],
    note: "Thành công: bạn nhận `partyLeft`, thành viên còn lại nhận notice `member_left`.",
})
export class PartyLeaveGlobalCommand extends PartyMemberGlobalCommand {
    static readonly message = GlobalClientMessage.PARTY_LEAVE;

    execute({ client }: PartyCommandPayload) {
        partyGlobalService.removeMember(
            this.room,
            this.party,
            client.auth.playerId,
            PartyNotice.MEMBER_LEFT
        );
        this.result = Response.success();
    }
}
