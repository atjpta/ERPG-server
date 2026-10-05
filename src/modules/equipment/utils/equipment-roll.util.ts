import { Big, big, bigToNumber } from "@/core/utils/big-number.util.js";
import type {
    EquipmentDropConfig,
    EquipmentStatEntry,
    StatRange,
    WeightedStatRange,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { StatBonus } from "@/modules/player/schemas/stat.schema.js";

/** Nguồn ngẫu nhiên [0, 1) — truyền vào để test được (mặc định `Math.random`). */
export type Rng = () => number;

/** Thứ tự rarity từ thấp → cao (tinh hoá đi theo thứ tự này). */
export const RARITY_ORDER: readonly ItemRarity[] = [
    ItemRarity.COMMON,
    ItemRarity.GOOD,
    ItemRarity.RARE,
    ItemRarity.EPIC,
    ItemRarity.LEGENDARY,
];

export const nextRarity = (rarity: ItemRarity): ItemRarity | undefined =>
    RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1];

/** Chọn 1 phần tử theo `weight`; danh sách rỗng / tổng trọng số ≤ 0 → `undefined`. */
export function pickWeighted<T>(
    items: readonly T[],
    weightOf: (item: T) => Big | number,
    rng: Rng
): T | undefined {
    const weights = items.map((item) => Big.max(0, weightOf(item)));
    const total = weights.reduce((sum, weight) => sum.plus(weight), big(0));
    if (total.lte(0)) return undefined;
    let roll = total.times(rng());
    for (let i = 0; i < items.length; i++) {
        roll = roll.minus(weights[i]);
        if (roll.lt(0)) return items[i];
    }
    return items[items.length - 1];
}

/** Giá trị ngẫu nhiên trong [min, max] (4 chữ số thập phân). */
export const rollStatRange = (range: StatRange, rng: Rng): StatBonus => ({
    stat: range.stat,
    type: range.type,
    value: bigToNumber(big(range.min).plus(big(range.max).minus(range.min).times(rng()))),
});

const lineKey = (line: Pick<StatBonus, "stat" | "type">) => `${line.stat}:${line.type}`;

/**
 * Roll `count` dòng từ pool, không trùng (stat, type) với nhau và với `existing`. Pool hết dòng hợp
 * lệ thì dừng sớm.
 */
export function rollPoolLines(
    pool: readonly WeightedStatRange[],
    count: number,
    rng: Rng,
    existing: readonly StatBonus[] = []
): StatBonus[] {
    const used = new Set(existing.map(lineKey));
    const lines: StatBonus[] = [];
    for (let i = 0; i < count; i++) {
        const candidates = pool.filter((range) => !used.has(lineKey(range)));
        const picked = pickWeighted(candidates, (range) => range.weight, rng);
        if (!picked) break;
        used.add(lineKey(picked));
        lines.push(rollStatRange(picked, rng));
    }
    return lines;
}

/** Tạo chỉ số cho 1 món mới theo bảng của loại trang bị đó. */
export function rollEquipmentInstance(params: {
    entry: EquipmentStatEntry;
    rarity: ItemRarity;
    rarityLineCount: Record<ItemRarity, number>;
    rng: Rng;
}): ItemEquipmentInstanceMetadata {
    const { entry, rarity, rarityLineCount, rng } = params;
    return {
        level: entry.level,
        rarity,
        enhanceLevel: 0,
        refineLevel: 0,
        mainStats: entry.main.map((range) => rollStatRange(range, rng)),
        subStats: rollPoolLines(entry.subPool, entry.subLineCount, rng),
        rarityStats: rollPoolLines(entry.rarityPool, rarityLineCount[rarity], rng),
    };
}

/**
 * Chọn mốc level đồ rơi từ quái level `monsterLevel`: trọng số mỗi mốc =
 * max(0, 1 − |monsterLevel − mốc| / levelRange). Không mốc nào đủ gần → `undefined` (không rơi).
 */
export function rollDropLevel(
    monsterLevel: number,
    config: EquipmentDropConfig,
    rng: Rng
): number | undefined {
    return pickWeighted(
        config.levelTiers,
        (tier) => big(1).minus(big(monsterLevel).minus(tier).abs().div(config.levelRange)),
        rng
    );
}
