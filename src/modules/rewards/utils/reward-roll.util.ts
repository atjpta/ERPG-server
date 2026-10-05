import { big, floorBig } from "@/core/utils/big-number.util.js";
import { pickWeighted, type Rng } from "@/modules/equipment/utils/equipment-roll.util.js";
import { ItemRarity, ItemSource } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentDrop,
    MonsterDrops,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { ItemReward, Reward } from "@/modules/rewards/types/reward.type.js";

/** Số nguyên ngẫu nhiên trong [min, max] (gồm cả hai đầu). */
export const randomInt = (min: number, max: number, rng: Rng = Math.random) =>
    min + floorBig(big(max - min + 1).times(rng()));

/** Trúng tỉ lệ `rate` (0 → 1). */
export const rollChance = (rate: number, rng: Rng = Math.random) => big(rng()).lt(rate);

/** Rarity theo trọng số của drop; không cấu hình → common. */
export const rollDropRarity = (drop: EquipmentDrop, rng: Rng = Math.random): ItemRarity =>
    pickWeighted(
        Object.entries(drop.rarity) as [ItemRarity, number][],
        ([, weight]) => weight,
        rng
    )?.[0] ?? ItemRarity.COMMON;

/**
 * Roll phần thưởng khi giết một monster: tiền random trong [min, max] của từng loại, item thường
 * theo tỉ lệ + số lượng, exp cố định. Trang bị biome do `rollEquipment` tạo (cần config + catalog).
 */
export function rollMonsterReward(
    drops: MonsterDrops,
    options: { rng?: Rng; rollEquipment?: (drop: EquipmentDrop) => ItemReward | undefined } = {}
): Reward {
    const { rng = Math.random, rollEquipment } = options;
    const items: ItemReward[] = drops.items
        .filter((drop) => rollChance(drop.rate, rng))
        .map((drop) => ({ itemId: drop.itemId, quantity: randomInt(drop.min, drop.max, rng) }));
    if (drops.equipment && rollEquipment && rollChance(drops.equipment.rate, rng)) {
        const equipment = rollEquipment(drops.equipment);
        if (equipment) items.push(equipment);
    }
    return {
        currency: drops.currency
            .map((drop) => ({ code: drop.code, amount: randomInt(drop.min, drop.max, rng) }))
            .filter((reward) => reward.amount > 0),
        items,
        source: ItemSource.DROP,
        exp: drops.exp,
    };
}
