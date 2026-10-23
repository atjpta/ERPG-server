import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PartyCommandPayload } from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { PartyInviteReplySchema } from "@/rooms/global/modules/party/validators/member.party.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";

/** Người được mời từ chối, báo cho chủ. */
@SdkMessage({
    note: "Response rỗng (kể cả khi lời mời không còn); chủ party nhận notice `invite_declined`.",
})
export class PartyDeclineGlobalCommand extends PlayerGlobalCommand<
    PartyCommandPayload,
    typeof PartyInviteReplySchema
> {
    static readonly message = GlobalClientMessage.PARTY_DECLINE;

    protected override readonly validateSchema = PartyInviteReplySchema;

    execute({ client }: PartyCommandPayload) {
        const party = this.room.parties.getParty(this.body.partyId);
        const { playerId } = client.auth;
        const invite = party?.removeInvite(playerId);
        if (party && invite) {
            partyGlobalService.cancelInviteExpiry(party.id, playerId);
            partyNotifyGlobalService.notifyLeader(
                this.room,
                party,
                PartyNotice.INVITE_DECLINED,
                invite.targetName
            );
        }
        this.result = Response.success();
    }
}
