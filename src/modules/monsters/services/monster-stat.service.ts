import { CalcService } from "@/core/calc/calc.service.js";
import type { Monster } from "@/modules/monsters/entities/monster.entity.js";
import type { MonsterLevelConfig } from "@/modules/monsters/schemas/monster-level-config.schema.js";
import type {
    MonsterScaleConfig,
    MonsterScaleEntry,
} from "@/modules/monsters/schemas/monster-scale-config.schema.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import type { MonsterVariant } from "@/modules/monsters/types/monster-stat.type.js";

export class MonsterStatService {
    /**
     * Stat cuối của monster ở `level` = base `stats` × (1 + tỉ lệ `statsPerLevel` × (level − 1)) × hệ số
     * của từng `scales` (loại, độ hiếm — thiếu stat = ×1).
     */
    computeMonsterStats(
        monster: Pick<Monster, "stats">,
        level: number,
        levelConfig: MonsterLevelConfig,
        scales: readonly Pick<MonsterScaleEntry, "stats">[] = []
    ): Stats {
        const calc = new CalcService("big");
        const stats: Stats = {};
        const levelsGained = Math.max(0, level - 1);
        for (const key of Object.values(StatKey)) {
            let value = calc.of(monster.stats[key] ?? 0).times(
                calc
                    .of(levelConfig.statsPerLevel[key] ?? 0)
                    .times(levelsGained)
                    .plus(1)
            );
            for (const scale of scales) value = value.times(scale.stats[key] ?? 1);
            if (!value.isZero()) stats[key] = value.toNumber();
        }
        return stats;
    }

    /** Hệ số của monster theo loại + độ hiếm (thứ tự: loại, độ hiếm). */
    monsterScales(monster: MonsterVariant, config: MonsterScaleConfig): MonsterScaleEntry[] {
        return [config.byType[monster.type], config.byRarity[monster.rarity]];
    }

    /** Kích thước của monster = tích `size` của các bảng (sprite, hitbox, collider, vùng đánh). */
    combineSize(scales: readonly MonsterScaleEntry[]) {
        const calc = new CalcService("big");
        return scales.reduce((total, scale) => total.times(scale.size), calc.of(1)).toNumber();
    }

    /** Nhân các hệ số thưởng (exp / gold / dropRate) của nhiều bảng với nhau. */
    combineRewardScale(scales: readonly MonsterScaleEntry[]) {
        const calc = new CalcService("big");
        return scales.reduce(
            (total, scale) => ({
                exp: total.exp.times(scale.exp),
                gold: total.gold.times(scale.gold),
                dropRate: total.dropRate.times(scale.dropRate),
            }),
            { exp: calc.of(1), gold: calc.of(1), dropRate: calc.of(1) }
        );
    }
}

export const monsterStatService = new MonsterStatService();
