import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { PARTY_NOTICE_BY_ERROR } from "@/rooms/party/constants/party-notice.constant.js";
import { PartyInviteSchema } from "@/rooms/party/modules/members/validators/member.party.validator.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import { PartyClientMessage, PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { worldRoomRemote } from "@/rooms/world/world.remote.js";
import { Command } from "@colyseus/command";
import { matchMaker } from "colyseus";
import { notice } from "@/rooms/party/services/party-notify.js";

interface Payload {
    client: PlayerClient;
    payload?: unknown;
}

export class InvitePartyCommand extends Command<PartyRoom, Payload> {
    static readonly message = PartyClientMessage.INVITE;

    async execute({ client, payload }: Payload) {
        const parsed = PartyInviteSchema.safeParse(payload);
        if (!parsed.success) return;
        const leaderId = client.auth.playerId;
        if (!this.room.state.isLeader(leaderId)) return notice(client, PartyNoticeCode.NOT_LEADER);
        if (!(await partyDirectoryService.allowInvite(leaderId))) {
            return notice(client, PartyNoticeCode.INVITE_LIMIT);
        }
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: this.room.serverId,
            name: parsed.data.playerName,
        });
        if (!target) return notice(client, PartyNoticeCode.TARGET_NOT_FOUND);

        const now = this.clock.currentTime;
        const error = this.room.state.canInvite(leaderId, target.id, now);
        if (error) return notice(client, PARTY_NOTICE_BY_ERROR[error], target.name);

        const existing = await partyDirectoryService.getPartyRoomId(target.id);
        if (existing && (await this.isRoomAlive(existing))) {
            return notice(client, PartyNoticeCode.TARGET_IN_PARTY, target.name);
        }
        const worldRoomId = await partyDirectoryService.getWorldRoomId(target.id);
        if (!worldRoomId) return notice(client, PartyNoticeCode.TARGET_OFFLINE, target.name);

        const ttlSec = this.room.state.config.inviteTtlSec;
        const snapshot = await worldRoomRemote(worldRoomId).partyDeliverInvite(target.id, {
            partyRoomId: this.room.roomId,
            fromName: this.room.state.nameOf(leaderId),
            expiresInSec: ttlSec,
            ...(parsed.data.request ? { autoAccept: true } : {}),
        });
        if (!snapshot) return notice(client, PartyNoticeCode.TARGET_OFFLINE, target.name);

        // Các lệnh await ở trên có thể để lời mời khác chiếm chỗ: kiểm lại trước khi giữ chỗ.
        const recheck = this.room.state.canInvite(leaderId, target.id, this.clock.currentTime);
        if (recheck) return notice(client, PARTY_NOTICE_BY_ERROR[recheck], target.name);
        this.room.state.addInvite(target.id, {
            fromName: this.room.state.nameOf(leaderId),
            snapshot,
            expiresAt: this.clock.currentTime + ttlSec * 1000,
        });
        this.room.worldRoomOf.set(target.id, worldRoomId);
        notice(client, PartyNoticeCode.INVITE_SENT, target.name);
    }

    private async isRoomAlive(roomId: string) {
        try {
            return (await matchMaker.getRoomById(roomId)) !== undefined;
        } catch {
            return false;
        }
    }
}
