import { Big, big, bigToNumber } from "@/core/utils/big-number.util.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
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

export class EquipmentRollService {
    nextRarity(rarity: ItemRarity): ItemRarity | undefined {
        return RARITY_ORDER[RARITY_ORDER.indexOf(rarity) + 1];
    }

    /** Chọn 1 phần tử theo `weight`; danh sách rỗng / tổng trọng số ≤ 0 → `undefined`. */
    pickWeighted<T>(
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
    rollStatRange(range: StatRange, rng: Rng): StatBonus {
        return {
            stat: range.stat,
            type: range.type,
            value: bigToNumber(big(range.min).plus(big(range.max).minus(range.min).times(rng()))),
        };
    }

    private lineKey(line: Pick<StatBonus, "stat" | "type">) {
        return `${line.stat}:${line.type}`;
    }

    /**
     * Roll `count` dòng từ pool, không trùng (stat, type) với nhau và với `existing`. Pool hết dòng hợp
     * lệ thì dừng sớm.
     */
    rollPoolLines(
        pool: readonly WeightedStatRange[],
        count: number,
        rng: Rng,
        existing: readonly StatBonus[] = []
    ): StatBonus[] {
        const used = new Set(existing.map((line) => this.lineKey(line)));
        const lines: StatBonus[] = [];
        for (let i = 0; i < count; i++) {
            const candidates = pool.filter((range) => !used.has(this.lineKey(range)));
            const picked = this.pickWeighted(candidates, (range) => range.weight, rng);
            if (!picked) break;
            used.add(this.lineKey(picked));
            lines.push(this.rollStatRange(picked, rng));
        }
        return lines;
    }

    /** Tạo chỉ số cho 1 món mới theo bảng của loại trang bị đó. */
    rollEquipmentInstance(params: {
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
            mainStats: entry.main.map((range) => this.rollStatRange(range, rng)),
            subStats: this.rollPoolLines(entry.subPool, entry.subLineCount, rng),
            rarityStats: this.rollPoolLines(entry.rarityPool, rarityLineCount[rarity], rng),
        };
    }

    /** Level đồ rơi từ quái của `biome`; biome không có trong config (vd. starter) → `undefined` (không rơi). */
    dropLevelOf(biome: Biome, config: EquipmentDropConfig): number | undefined {
        return config.levelByBiome[biome];
    }
}

export const equipmentRollService = new EquipmentRollService();
