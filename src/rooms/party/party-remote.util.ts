import { matchMaker, type Room } from "colyseus";
import type { PartyLootMode, PartyMemberInfo } from "@/modules/party/schemas/party.schema.js";

/**
 * Gọi method của world room từ party room qua `matchMaker.remoteRoomCall` (chạy được cả khi world room ở
 * process khác khi dùng Redis driver). Room không còn / quá hạn → trả `fallback` thay vì ném lỗi.
 */
const call = async <T>(
    roomId: string,
    method: string,
    args: unknown[],
    fallback: T
): Promise<T> => {
    try {
        return (await matchMaker.remoteRoomCall(roomId, method as keyof Room, args)) as T;
    } catch (err) {
        console.warn(`[Party] remoteRoomCall ${method} -> ${roomId} failed:`, err);
        return fallback;
    }
};

export interface InvitePayload {
    partyRoomId: string;
    fromName: string;
    expiresInSec: number;
}

/** Các method `WorldRoom` mà party room gọi (cài đặt ở `world.room.ts` / `party.world.service.ts`). */
export const worldRemote = {
    /** Gửi lời mời tới client của `playerId`; trả snapshot người đó, `null` nếu không còn ở room này. */
    deliverInvite: (worldRoomId: string, playerId: string, payload: InvitePayload) =>
        call<PartyMemberInfo | null>(worldRoomId, "partyDeliverInvite", [playerId, payload], null),
    /** Gán / bỏ party cho `playerId` ở world room. */
    setPlayerParty: (
        worldRoomId: string,
        playerId: string,
        partyRoomId: string | null,
        lootMode?: PartyLootMode
    ) =>
        call<void>(
            worldRoomId,
            "partySetPlayerParty",
            [playerId, partyRoomId, lootMode],
            undefined
        ),
    /** Lệnh vào dungeon theo party: trả mã lỗi (`undefined` = đã gửi mapChange). */
    enterDungeon: (
        worldRoomId: string,
        playerId: string,
        dungeonCode: string,
        instanceId: string,
        spawnId: string,
        retry = false
    ) =>
        call<string | undefined>(
            worldRoomId,
            "partyEnterDungeon",
            [playerId, dungeonCode, instanceId, spawnId, retry],
            "offline"
        ),
};
