import { cacheService } from "@/core/cache/cache.service.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import {
    PartyMemberGlobalCommand,
    type PartyCommandPayload,
} from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { PartyInviteSchema } from "@/rooms/global/modules/party/validators/member.party.validator.js";
import { GlobalClientMessage, GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type {
    PartyInviteReceivedMessage,
    PartyNoticeMessage,
} from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { PartyErrorCode } from "@/modules/party/enums/party-error-code.enum.js";

const INVITE_RATE_WINDOW_SEC = 60;
const INVITE_RATE_LIMIT = 10;

@SdkMessage({
    response: "PartyNoticeMessage",
    errors: [
        PartyErrorCode.PARTY_NOT_MEMBER,
        PartyErrorCode.PARTY_NOT_LEADER,
        PartyErrorCode.PARTY_INVITE_LIMIT,
        PartyErrorCode.PARTY_TARGET_NOT_FOUND,
        PartyErrorCode.PARTY_SELF_TARGET,
        PartyErrorCode.PARTY_ALREADY_MEMBER,
        PartyErrorCode.PARTY_FULL,
        PartyErrorCode.PARTY_TARGET_IN_PARTY,
        PartyErrorCode.PARTY_TARGET_OFFLINE,
    ],
    note: "Thành công: response là notice `invite_sent`; người được mời nhận `partyInviteReceived`. Lỗi có `error.playerName` (nếu biết người được mời).",
})
export class PartyInviteGlobalCommand extends PartyMemberGlobalCommand<typeof PartyInviteSchema> {
    static readonly message = GlobalClientMessage.PARTY_INVITE;

    protected override readonly validateSchema = PartyInviteSchema;
    protected override readonly leaderOnly = true;

    async execute({ client }: PartyCommandPayload) {
        const { room, party } = this;
        const leaderId = client.auth.playerId;
        const refuse = (code: string, playerName?: string) => {
            this.result = Response.error(code, playerName ? { playerName } : null);
        };

        // Chống spam lời mời: tối đa 10 lời mời / phút / người mời (cache dùng chung nhiều process).
        const invitesSent = await cacheService.incr(
            `party:invite-rate:${room.serverId}:${leaderId}`,
            INVITE_RATE_WINDOW_SEC
        );
        if (invitesSent > INVITE_RATE_LIMIT) return refuse(PartyErrorCode.PARTY_INVITE_LIMIT);
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: room.serverId,
            name: this.body.playerName,
        });
        if (!target) return refuse(PartyErrorCode.PARTY_TARGET_NOT_FOUND);
        // Chặn nhau (một trong hai chiều): coi như không tìm thấy, không lộ việc bị chặn.
        if (await playerBlockService.isBlockedEitherWay(leaderId, target.id)) {
            return refuse(PartyErrorCode.PARTY_TARGET_NOT_FOUND);
        }

        // Đang ở party khác: từ chối. Chính là party này (tự mời mình / đã là thành viên) thì để `addInvite` báo mã riêng.
        const targetParty = this.room.parties.getPartyByPlayerId(target.id);
        if (targetParty && targetParty !== party) {
            return refuse(PartyErrorCode.PARTY_TARGET_IN_PARTY, target.name);
        }
        // Người được mời phải đang online (có kết nối global để nhận lời mời) và đã vào world.
        // Người được mời phải đã vào world.
        if (!room.sessionOf.has(target.id) || !room.players.get(target.id)?.isInWorld) {
            return refuse(PartyErrorCode.PARTY_TARGET_OFFLINE, target.name);
        }

        const ttlSec = party.config.inviteTtlSec;
        const invited = party.addInvite(leaderId, target.id, {
            fromName: party.getMemberName(leaderId),
            targetName: target.name,
        });
        if (Response.isError(invited)) return refuse(invited.errorCode, target.name);
        partyGlobalService.scheduleInviteExpiry(room, party, target.id);
        const invite: PartyInviteReceivedMessage = {
            partyId: party.id,
            fromName: party.getMemberName(leaderId),
            expiresInSec: ttlSec,
            ...(this.body.request ? { autoAccept: true } : {}),
        };
        partyNotifyGlobalService.sendTo(
            room,
            target.id,
            GlobalMessage.PARTY_INVITE_RECEIVED,
            invite
        );
        this.result = Response.success<PartyNoticeMessage>({
            notice: PartyNotice.INVITE_SENT,
            playerName: target.name,
        });
    }
}
