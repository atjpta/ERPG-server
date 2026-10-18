import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import { PartyDeliverInviteWorldCommand } from "@/rooms/world/modules/players/commands/party-deliver-invite.world.command.js";
import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { PartyInviteSchema } from "@/rooms/party/modules/members/validators/member.party.validator.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { partyDirectoryService } from "@/rooms/party/services/party-directory.service.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { matchMaker } from "colyseus";
import { notice, noticeError } from "@/rooms/party/services/party-notify.js";

interface Payload {
    client: PlayerClient;
    payload?: unknown;
}

@SdkMessage({
    replies: [PartyMessage.NOTICE],
    errors: [
        PartyErrorCode.PARTY_NOT_LEADER,
        PartyErrorCode.PARTY_INVITE_LIMIT,
        PartyErrorCode.PARTY_TARGET_NOT_FOUND,
        PartyErrorCode.PARTY_SELF_TARGET,
        PartyErrorCode.PARTY_ALREADY_MEMBER,
        PartyErrorCode.PARTY_FULL,
        PartyErrorCode.PARTY_TARGET_IN_PARTY,
        PartyErrorCode.PARTY_TARGET_OFFLINE,
    ],
    note: "Thành công: notice `invite_sent`. Payload sai thì server im lặng.",
})
export class InvitePartyCommand extends Command<PartyRoom, Payload> {
    static readonly message = PartyClientMessage.INVITE;

    async execute({ client, payload }: Payload) {
        const parsed = PartyInviteSchema.safeParse(payload);
        if (!parsed.success) return;
        const leaderId = client.auth.playerId;
        if (!this.room.state.isLeader(leaderId))
            return noticeError(client, PartyErrorCode.PARTY_NOT_LEADER);
        if (!(await partyDirectoryService.allowInvite(leaderId))) {
            return noticeError(client, PartyErrorCode.PARTY_INVITE_LIMIT);
        }
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: this.room.serverId,
            name: parsed.data.playerName,
        });
        if (!target) return noticeError(client, PartyErrorCode.PARTY_TARGET_NOT_FOUND);

        const now = this.clock.currentTime;
        const error = this.room.state.canInvite(leaderId, target.id, now);
        if (error) return noticeError(client, error, target.name);

        const existing = await partyDirectoryService.getPartyRoomId(target.id);
        if (existing && (await this.isRoomAlive(existing))) {
            return noticeError(client, PartyErrorCode.PARTY_TARGET_IN_PARTY, target.name);
        }
        const worldRoomId = await partyDirectoryService.getWorldRoomId(target.id);
        if (!worldRoomId)
            return noticeError(client, PartyErrorCode.PARTY_TARGET_OFFLINE, target.name);

        const ttlSec = this.room.state.config.inviteTtlSec;
        const delivered = await callRoom(worldRoomId, PartyDeliverInviteWorldCommand, {
            playerId: target.id,
            message: {
                partyRoomId: this.room.roomId,
                fromName: this.room.state.nameOf(leaderId),
                expiresInSec: ttlSec,
                ...(parsed.data.request ? { autoAccept: true } : {}),
            },
        });
        if (!delivered.success) {
            return noticeError(client, PartyErrorCode.PARTY_TARGET_OFFLINE, target.name);
        }

        // Các lệnh await ở trên có thể để lời mời khác chiếm chỗ: kiểm lại trước khi giữ chỗ.
        const recheck = this.room.state.canInvite(leaderId, target.id, this.clock.currentTime);
        if (recheck) return noticeError(client, recheck, target.name);
        this.room.state.addInvite(target.id, {
            fromName: this.room.state.nameOf(leaderId),
            snapshot: delivered.data,
            expiresAt: this.clock.currentTime + ttlSec * 1000,
        });
        this.room.worldRoomOf.set(target.id, worldRoomId);
        notice(client, PartyNotice.INVITE_SENT, target.name);
    }

    private async isRoomAlive(roomId: string) {
        try {
            return (await matchMaker.getRoomById(roomId)) !== undefined;
        } catch {
            return false;
        }
    }
}
