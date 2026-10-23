import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PartyCommandPayload } from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { PartyTargetSchema } from "@/rooms/global/modules/party/validators/member.party.validator.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type {
    PartyJoinRequestMessage,
    PartyNoticeMessage,
} from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { PartyErrorCode } from "@/modules/party/enums/party-error-code.enum.js";

/**
 * Xin vào party của một người cùng world room: kiểm tra chỗ rồi báo cho chủ; thành công = đã gửi tới chủ,
 * thất bại = lý do không gửi được.
 */
@SdkMessage({
    response: "PartyNoticeMessage",
    errors: [
        PartyErrorCode.PARTY_ALREADY_MEMBER,
        PartyErrorCode.PARTY_SELF_TARGET,
        PartyErrorCode.PARTY_TARGET_NOT_IN_PARTY,
        PartyErrorCode.PARTY_FULL,
        PartyErrorCode.PARTY_TARGET_OFFLINE,
        PlayerErrorCode.PLAYER_NOT_HERE,
    ],
    note: "Thành công: response là notice `join_request_sent`; chủ party nhận `partyJoinRequest`.",
})
export class PartyRequestJoinGlobalCommand extends PlayerGlobalCommand<
    PartyCommandPayload,
    typeof PartyTargetSchema
> {
    static readonly message = GlobalClientMessage.PARTY_REQUEST_JOIN;

    protected override readonly validateSchema = PartyTargetSchema;

    execute({ client }: PartyCommandPayload) {
        const { room } = this;
        const requesterId = client.auth.playerId;
        const targetId = this.body.playerId;
        const refuse = (code: string) => {
            this.result = Response.error(code);
        };

        if (targetId === requesterId) return refuse(PartyErrorCode.PARTY_SELF_TARGET);
        const here = room.players.get(requesterId)?.worldRoomId;
        const there = room.players.get(targetId)?.worldRoomId;
        if (!here || !there || here !== there) {
            return refuse(PlayerErrorCode.PLAYER_NOT_HERE);
        }
        if (this.room.parties.getPartyByPlayerId(requesterId))
            return refuse(PartyErrorCode.PARTY_ALREADY_MEMBER);
        const party = this.room.parties.getPartyByPlayerId(targetId);
        if (!party) return refuse(PartyErrorCode.PARTY_TARGET_NOT_IN_PARTY);

        const leaderId = party.leaderPlayerId;
        if (!party.hasRoomFor(requesterId)) return refuse(PartyErrorCode.PARTY_FULL);
        if (!room.sessionOf.has(leaderId)) return refuse(PartyErrorCode.PARTY_TARGET_OFFLINE);

        const request: PartyJoinRequestMessage = {
            partyId: party.id,
            fromName: this.player.name,
            expiresInSec: party.config.inviteTtlSec,
        };
        partyNotifyGlobalService.sendTo(room, leaderId, GlobalMessage.PARTY_JOIN_REQUEST, request);
        this.result = Response.success<PartyNoticeMessage>({
            notice: PartyNotice.JOIN_REQUEST_SENT,
        });
    }
}
