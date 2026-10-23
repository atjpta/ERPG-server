import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PartyCommandPayload } from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { PartyInviteReplySchema } from "@/rooms/global/modules/party/validators/member.party.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { PartyStateMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { PartyErrorCode } from "@/rooms/runtime/modules/party/enums/party-error-code.enum.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";

/** Nhận lời mời vào party (còn hạn, còn chỗ). */
@SdkMessage({
    response: "PartyStateMessage",
    errors: [
        PartyErrorCode.PARTY_NO_INVITE,
        PartyErrorCode.PARTY_ALREADY_MEMBER,
        PartyErrorCode.PARTY_FULL,
    ],
    note: "Thành công: các thành viên khác nhận notice `member_joined`, mọi người nhận `partyState` mới.",
})
export class PartyAcceptInviteGlobalCommand extends PlayerGlobalCommand<
    PartyCommandPayload,
    typeof PartyInviteReplySchema
> {
    static readonly message = GlobalClientMessage.PARTY_ACCEPT_INVITE;

    protected override readonly validateSchema = PartyInviteReplySchema;

    execute({ client }: PartyCommandPayload) {
        const { playerId } = client.auth;
        const party = this.room.runtime.parties.getParty(this.body.partyId);
        if (!party) {
            this.result = Response.error(PartyErrorCode.PARTY_NO_INVITE);
            return;
        }

        const error = this.room.runtime.parties.join(party, playerId);
        if (error) {
            this.result = Response.error(error);
            return;
        }

        partyGlobalService.cancelInviteExpiry(party.id, playerId);
        partyGlobalService.publishMembership(this.room, party, playerId, party.id);
        partyNotifyGlobalService.broadcastNotice(
            this.room,
            party,
            PartyNotice.MEMBER_JOINED,
            party.getMemberName(playerId),
            playerId
        );
        partyNotifyGlobalService.broadcastState(this.room, party);

        this.result = Response.success<PartyStateMessage>(
            partyNotifyGlobalService.snapshotOf(party)
        );
    }
}
