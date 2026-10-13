import { WorldChainAction, WorldChainResult } from "@/rooms/world/chains/world.chain.js";
import type { MonsterChainContext } from "@/rooms/world/chains/monster.world.chain.js";

/**
 * Spawn có `healAfterIdleSec` (bù nhìn phòng tập): quá chừng đó giây không nhận sát thương thì hồi đầy máu.
 * `takeDamage` đặt lại bộ đếm, nên đánh liên tục thì không hồi.
 */
export class MonsterIdleHealChain implements WorldChainAction<MonsterChainContext> {
    execute({ room, monster }: MonsterChainContext): WorldChainResult {
        const seconds = monster.spawn.healAfterIdleSec;
        if (!seconds || monster.hp <= 0) return WorldChainResult.CONTINUE;
        if (monster.hp >= monster.maxHp) {
            monster.idleTicks = 0;
            return WorldChainResult.CONTINUE;
        }
        monster.idleTicks++;
        if (monster.idleTicks >= seconds * room.tickRate) {
            monster.hp = monster.maxHp;
            monster.idleTicks = 0;
        }
        return WorldChainResult.CONTINUE;
    }
}
