import type { ErrorCode } from "@/core/types/result.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { fail } from "@/core/utils/result.util.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import {
    PartyMessage,
    type PartyDungeonDeniedMessage,
    type PartyNotice,
    type PartyNoticeMessage,
} from "@/rooms/party/types/party-message.type.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { DungeonFailure } from "@/rooms/party/types/party-room.type.js";

const noticeData = (notice: PartyNotice, playerName?: string): PartyNoticeMessage => ({
    notice,
    ...(playerName ? { playerName } : {}),
});

/** Gửi một sự kiện thành công cho một client. */
export const notice = (client: PlayerClient, notice: PartyNotice, playerName?: string) =>
    client.sendSuccess(PartyMessage.NOTICE, noticeData(notice, playerName));

/** Gửi lỗi thao tác (`code` là `ErrorCode`) cho một client. */
export const noticeError = (client: PlayerClient, code: ErrorCode, playerName?: string) =>
    client.sendError(PartyMessage.NOTICE, code, playerName ? { playerName } : null);

export function notifyLeader(room: PartyRoom, notice: PartyNotice, playerName?: string) {
    const sessionId = room.sessionOf.get(room.state.leaderPlayerId);
    const client = sessionId ? room.clients.getById(sessionId) : undefined;
    if (client) client.sendSuccess(PartyMessage.NOTICE, noticeData(notice, playerName));
}

export function broadcastNotice(
    room: PartyRoom,
    notice: PartyNotice,
    playerName?: string,
    exceptPlayerId?: string
) {
    const exceptSession = exceptPlayerId ? room.sessionOf.get(exceptPlayerId) : undefined;
    const except = exceptSession ? room.clients.getById(exceptSession) : undefined;
    room.broadcastSuccess(PartyMessage.NOTICE, noticeData(notice, playerName), { except });
}

export function broadcastDungeonDenied(
    room: PartyRoom,
    dungeonCode: string,
    failures: DungeonFailure[]
) {
    const denied: PartyDungeonDeniedMessage = { dungeonCode, failures };
    room.broadcastResult(
        PartyMessage.DUNGEON_DENIED,
        fail(MapErrorCode.DUNGEON_DENIED, undefined, { ...denied })
    );
}
