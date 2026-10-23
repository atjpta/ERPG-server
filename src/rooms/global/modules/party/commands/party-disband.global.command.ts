import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PartyMemberGlobalCommand } from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import type { PartyLeftMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { PartyErrorCode } from "@/rooms/runtime/modules/party/enums/party-error-code.enum.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";

@SdkMessage({
    errors: [PartyErrorCode.PARTY_NOT_MEMBER, PartyErrorCode.PARTY_NOT_LEADER],
    note: "Thành công: mọi thành viên nhận notice `disbanded` rồi `partyLeft`.",
})
export class PartyDisbandGlobalCommand extends PartyMemberGlobalCommand {
    static readonly message = GlobalClientMessage.PARTY_DISBAND;

    protected override readonly leaderOnly = true;

    execute() {
        const { room, party } = this;
        partyGlobalService.cancelInviteExpiries(party.id);
        // Báo trước khi đưa ra để còn đủ thành viên nhận.
        partyNotifyGlobalService.broadcastNotice(room, party, PartyNotice.DISBANDED);
        for (const playerId of this.room.runtime.parties.disband(party)) {
            partyGlobalService.publishMembership(this.room, party, playerId, null);
            partyNotifyGlobalService.sendTo(room, playerId, GlobalMessage.PARTY_LEFT, {
                partyId: party.id,
            } satisfies PartyLeftMessage);
        }
        this.result = Response.success();
    }
}
