import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import {
    PartyMessage,
    PartyNoticeCode,
    type PartyDungeonDeniedMessage,
    type PartyNoticeMessage,
} from "@/rooms/party/types/party-message.type.js";
import type { DungeonFailure } from "@/rooms/party/types/party-room.type.js";

const noticeMessage = (code: PartyNoticeCode, playerName?: string): PartyNoticeMessage => ({
    code,
    ...(playerName ? { playerName } : {}),
});

export const notice = (client: PlayerClient, code: PartyNoticeCode, playerName?: string) =>
    client.send(PartyMessage.NOTICE, noticeMessage(code, playerName));

export function notifyLeader(room: PartyRoom, code: PartyNoticeCode, playerName?: string) {
    const sessionId = room.sessionOf.get(room.state.leaderPlayerId);
    const client = sessionId ? room.clients.getById(sessionId) : undefined;
    if (client) notice(client, code, playerName);
}

export function broadcastNotice(
    room: PartyRoom,
    code: PartyNoticeCode,
    playerName?: string,
    exceptPlayerId?: string
) {
    const exceptSession = exceptPlayerId ? room.sessionOf.get(exceptPlayerId) : undefined;
    const except = exceptSession ? room.clients.getById(exceptSession) : undefined;
    room.broadcast(PartyMessage.NOTICE, noticeMessage(code, playerName), { except });
}

export function broadcastDungeonDenied(
    room: PartyRoom,
    dungeonCode: string,
    failures: DungeonFailure[]
) {
    const message: PartyDungeonDeniedMessage = { dungeonCode, failures };
    room.broadcast(PartyMessage.DUNGEON_DENIED, message);
}
