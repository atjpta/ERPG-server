import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import type { Monster } from "@/modules/monsters/entities/monster.entity.js";
import type {
    MonsterScaleConfig,
    MonsterScaleEntry,
} from "@/modules/monsters/schemas/monster-scale-config.schema.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";

/**
 * Stat cuối của monster ở `level` = (cố định `stats` + `statsPerLevel` × level) × hệ số của từng
 * `scales` (loại, độ hiếm — thiếu stat = ×1).
 */
export function computeMonsterStats(
    monster: Pick<Monster, "stats" | "statsPerLevel">,
    level: number,
    scales: readonly Pick<MonsterScaleEntry, "stats">[] = []
): Stats {
    const stats: Stats = {};
    for (const key of Object.values(StatKey)) {
        let value = big(monster.statsPerLevel[key] ?? 0)
            .times(level)
            .plus(monster.stats[key] ?? 0);
        for (const scale of scales) value = value.times(scale.stats[key] ?? 1);
        if (!value.isZero()) stats[key] = bigToNumber(value);
    }
    return stats;
}

/** Hệ số của monster theo loại + độ hiếm (thứ tự: loại, độ hiếm). */
export const monsterScales = (
    monster: Pick<Monster, "type" | "rarity">,
    config: MonsterScaleConfig
): MonsterScaleEntry[] => [config.byType[monster.type], config.byRarity[monster.rarity]];

/** Nhân các hệ số thưởng (exp / gold / dropRate) của nhiều bảng với nhau. */
export const combineRewardScale = (scales: readonly MonsterScaleEntry[]) =>
    scales.reduce(
        (total, scale) => ({
            exp: total.exp.times(scale.exp),
            gold: total.gold.times(scale.gold),
            dropRate: total.dropRate.times(scale.dropRate),
        }),
        { exp: big(1), gold: big(1), dropRate: big(1) }
    );
