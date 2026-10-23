import { cacheService } from "@/core/cache/cache.service.js";
import type { DungeonExpectation } from "@/rooms/global/modules/dungeon-launch/types/dungeon-expectation.type.js";

const DUNGEON_EXPECT_TTL_SEC = 300;

/**
 * Người chơi được kỳ vọng vào một instance dungeon, lưu trong cache (Redis khi có `REDIS_URI`, không thì bộ nhớ)
 * để dungeon room — có thể ở process khác — đọc lúc tạo. Global ghi khi cả party vào dungeon; world đọc.
 */
export class DungeonExpectationService {
    private key = (serverId: string, instanceId: string) =>
        `dungeon:expect:${serverId}:${instanceId}`;

    set(serverId: string, instanceId: string, expectation: DungeonExpectation): Promise<void> {
        return cacheService.set(
            this.key(serverId, instanceId),
            expectation,
            DUNGEON_EXPECT_TTL_SEC
        );
    }

    get(serverId: string, instanceId: string): Promise<DungeonExpectation | null> {
        return cacheService.get<DungeonExpectation>(this.key(serverId, instanceId));
    }
}

export const dungeonExpectationService = new DungeonExpectationService();
