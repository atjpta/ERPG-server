import { RoomResponse } from "@/core/response/room-response.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PartyState } from "@/modules/party/state/party.state.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import type {
    PartyNoticeMessage,
    PartyStateMessage,
} from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import type { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";

/** Gửi message của party xuống client (kết nối global). Không đổi dữ liệu party. */
export class PartyNotifyGlobalService {
    /** Snapshot đầy đủ của party gửi cho client (thành viên theo thứ tự vào party). */
    snapshotOf(party: PartyState): PartyStateMessage {
        return {
            partyId: party.id,
            leaderPlayerId: party.leaderPlayerId,
            lootMode: party.lootMode,
            members: [...party.members].map(([playerId, name]) => ({ playerId, name })),
        };
    }

    private noticeData(notice: PartyNotice, playerName?: string): PartyNoticeMessage {
        return {
            notice,
            ...(playerName ? { playerName } : {}),
        };
    }

    /** Đẩy một message thành công tới kết nối global của `playerId` (không có kết nối thì bỏ qua). */
    sendTo(room: GlobalRoom, playerId: string, type: GlobalMessage, data: unknown) {
        const client = room.clientOf(playerId);
        if (client) RoomResponse.send(client, type, data);
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
        const snapshot = this.snapshotOf(party);
        for (const playerId of party.members.keys()) {
            this.sendTo(room, playerId, GlobalMessage.PARTY_STATE, snapshot);
        }
    }
}

export const partyNotifyGlobalService = new PartyNotifyGlobalService();
