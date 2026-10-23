import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PartyState } from "@/rooms/global/modules/party/schemas/party.global.state.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type { PartyNoticeMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import type { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";

/** Gửi message của party xuống client (kết nối global). Không đổi dữ liệu party. */
export class PartyNotifyGlobalService {
    private noticeData(notice: PartyNotice, playerName?: string): PartyNoticeMessage {
        return {
            notice,
            ...(playerName ? { playerName } : {}),
        };
    }

    /** Đẩy một message thành công tới kết nối global của `playerId` (không có kết nối thì bỏ qua). */
    sendTo(room: GlobalRoom, playerId: string, type: GlobalMessage, data: unknown) {
        room.clientOf(playerId)?.sendSuccess(type, data);
    }

    /** Báo sự kiện cho chủ party. */
    notifyLeader(room: GlobalRoom, party: PartyState, notice: PartyNotice, playerName?: string) {
        this.sendTo(
            room,
            party.leaderPlayerId,
            GlobalMessage.PARTY_NOTICE,
            this.noticeData(notice, playerName)
        );
    }

    /** Báo sự kiện cho mọi thành viên hiện tại (trừ `exceptPlayerId`). */
    broadcastNotice(
        room: GlobalRoom,
        party: PartyState,
        notice: PartyNotice,
        playerName?: string,
        exceptPlayerId?: string
    ) {
        for (const playerId of party.members.keys()) {
            if (playerId === exceptPlayerId) continue;
            this.sendTo(
                room,
                playerId,
                GlobalMessage.PARTY_NOTICE,
                this.noticeData(notice, playerName)
            );
        }
    }

    /** Gửi snapshot đầy đủ của party cho mọi thành viên (sau mỗi thay đổi). */
    broadcastState(room: GlobalRoom, party: PartyState) {
        const snapshot = party.toMessage();
        for (const playerId of party.members.keys()) {
            this.sendTo(room, playerId, GlobalMessage.PARTY_STATE, snapshot);
        }
    }
}

export const partyNotifyGlobalService = new PartyNotifyGlobalService();
