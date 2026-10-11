import { cacheService } from "@/core/cache/cache.service.js";

/** Con trỏ `playerId → partyRoomId` hết hạn sau chừng này giây nếu không được làm mới (heartbeat world room 30s). */
const PARTY_POINTER_TTL_SEC = 300;
/** World room làm mới mỗi checkpoint (30s); quá hạn = coi như offline. */
const ONLINE_TTL_SEC = 90;
const DUNGEON_EXPECT_TTL_SEC = 300;
const INVITE_RATE_WINDOW_SEC = 60;
const INVITE_RATE_LIMIT = 10;

export interface DungeonExpectation {
    dungeonCode: string;
    leaderPlayerId: string;
    /** Người sẽ vào instance — dungeon room chờ đủ rồi mới bắt đầu. */
    expected: string[];
}

/**
 * Thông tin để các room tìm nhau qua cache (Redis khi có `REDIS_URI`, không thì bộ nhớ): party room của
 * player, world room player đang đứng, người chơi được kỳ vọng vào 1 instance dungeon. Không phải nguồn
 * sự thật — party room mới là nguồn sự thật về thành viên.
 */
export class PartyDirectoryService {
    private partyKey = (playerId: string) => `party:of:${playerId}`;
    private onlineKey = (playerId: string) => `online:player:${playerId}`;
    private expectKey = (instanceId: string) => `dungeon:expect:${instanceId}`;

    getPartyRoomId(playerId: string): Promise<string | null> {
        return cacheService.get<string>(this.partyKey(playerId));
    }

    /** Đặt / làm mới con trỏ party của player. */
    setPartyRoomId(playerId: string, partyRoomId: string): Promise<void> {
        return cacheService.set(this.partyKey(playerId), partyRoomId, PARTY_POINTER_TTL_SEC);
    }

    clearPartyRoomId(playerId: string): Promise<void> {
        return cacheService.del(this.partyKey(playerId));
    }

    /** World room báo player đang ở đó (gọi mỗi checkpoint để làm mới). */
    setWorldRoomId(playerId: string, worldRoomId: string): Promise<void> {
        return cacheService.set(this.onlineKey(playerId), worldRoomId, ONLINE_TTL_SEC);
    }

    getWorldRoomId(playerId: string): Promise<string | null> {
        return cacheService.get<string>(this.onlineKey(playerId));
    }

    /** Chỉ xoá khi vẫn trỏ về `worldRoomId` này (room mới có thể đã ghi đè khi đổi map). */
    async clearWorldRoomId(playerId: string, worldRoomId: string): Promise<void> {
        if ((await this.getWorldRoomId(playerId)) === worldRoomId) {
            await cacheService.del(this.onlineKey(playerId));
        }
    }

    setDungeonExpectation(instanceId: string, expectation: DungeonExpectation): Promise<void> {
        return cacheService.set(this.expectKey(instanceId), expectation, DUNGEON_EXPECT_TTL_SEC);
    }

    getDungeonExpectation(instanceId: string): Promise<DungeonExpectation | null> {
        return cacheService.get<DungeonExpectation>(this.expectKey(instanceId));
    }

    /** Chống spam lời mời: tối đa 10 lời mời / phút / người mời. `true` = còn được mời. */
    async allowInvite(inviterPlayerId: string): Promise<boolean> {
        const count = await cacheService.incr(
            `party:invite-rate:${inviterPlayerId}`,
            INVITE_RATE_WINDOW_SEC
        );
        return count <= INVITE_RATE_LIMIT;
    }
}

export const partyDirectoryService = new PartyDirectoryService();
