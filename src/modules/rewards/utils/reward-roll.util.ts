import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";

/** Số nguyên ngẫu nhiên trong [min, max] (gồm cả hai đầu). */
const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Roll phần thưởng khi giết một monster: tiền random trong [min, max] của từng loại, exp cố định.
 * Item chưa làm (`items` luôn rỗng).
 */
export function rollMonsterReward(drops: MonsterDrops): Reward {
    return {
        currency: drops.currency
            .map((drop) => ({ code: drop.code, amount: randomInt(drop.min, drop.max) }))
            .filter((reward) => reward.amount > 0),
        items: [],
        source: ItemSource.DROP,
        exp: drops.exp,
    };
}
