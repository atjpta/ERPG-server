import { callRoom } from "@/core/rooms/room.integration.js";
import { PartyDeliverJoinRequestWorldCommand } from "@/rooms/world/modules/players/commands/party-deliver-join-request.world.command.js";
import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    fromPlayerId: string;
    fromName: string;
}

/**
 * RPC từ world: có người (cùng map với một thành viên) xin vào party. Kiểm tra chỗ rồi báo cho chủ;
 * thành công = đã gửi tới chủ, thất bại = lý do không gửi được.
 */
export class RequestJoinPartyCommand extends Command<PartyRoom, Payload> {
    result: Result = fail(CommonCode.ROOM_UNAVAILABLE);

    async execute({ fromPlayerId, fromName }: Payload) {
        const { room } = this;
        const { state } = room;
        const leaderId = state.leaderPlayerId;
        const error = state.canInvite(leaderId, fromPlayerId, this.clock.currentTime);
        const leaderWorldRoomId = room.worldRoomOf.get(leaderId);
        if (error || !leaderWorldRoomId) {
            this.result = fail(error ?? PartyErrorCode.PARTY_TARGET_OFFLINE);
            return;
        }
        const delivered = await callRoom(leaderWorldRoomId, PartyDeliverJoinRequestWorldCommand, {
            leaderId,
            message: {
                partyRoomId: room.roomId,
                fromName,
                expiresInSec: state.config.inviteTtlSec,
            },
        });
        this.result = delivered.success ? ok() : fail(PartyErrorCode.PARTY_TARGET_OFFLINE);
    }
}
