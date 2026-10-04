import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import type { Monster } from "@/modules/monsters/entities/monster.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";

/** Stat cuối của monster ở `level` = cố định (`stats`) + tăng theo level (`statsPerLevel` × level). */
export function computeMonsterStats(
    monster: Pick<Monster, "stats" | "statsPerLevel">,
    level: number
): Stats {
    const stats: Stats = {};
    for (const key of Object.values(StatKey)) {
        const value = big(monster.statsPerLevel[key] ?? 0)
            .times(level)
            .plus(monster.stats[key] ?? 0);
        if (!value.isZero()) stats[key] = bigToNumber(value);
    }
    return stats;
}
