import { PARTY_NOTICE_BY_ERROR } from "@/rooms/party/constants/party-notice.constant.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { worldRoomRemote } from "@/rooms/world/world.remote.js";
import { Command } from "@colyseus/command";

interface Payload {
    fromPlayerId: string;
    fromName: string;
}

/**
 * RPC từ world: có người (cùng map với một thành viên) xin vào party. Kiểm tra chỗ rồi báo cho chủ;
 * kết quả là mã thông báo cho người xin (gửi được / lý do không được).
 */
export class RequestJoinPartyCommand extends Command<PartyRoom, Payload> {
    result = PartyNoticeCode.TARGET_OFFLINE;

    async execute({ fromPlayerId, fromName }: Payload) {
        const { room } = this;
        const { state } = room;
        const leaderId = state.leaderPlayerId;
        const error = state.canInvite(leaderId, fromPlayerId, this.clock.currentTime);
        if (error) {
            this.result = PARTY_NOTICE_BY_ERROR[error];
            return;
        }
        const leaderWorldRoomId = room.worldRoomOf.get(leaderId);
        if (!leaderWorldRoomId) return;
        const delivered = await worldRoomRemote(leaderWorldRoomId).partyDeliverJoinRequest(
            leaderId,
            { partyRoomId: room.roomId, fromName, expiresInSec: state.config.inviteTtlSec }
        );
        if (delivered) this.result = PartyNoticeCode.JOIN_REQUEST_SENT;
    }
}
