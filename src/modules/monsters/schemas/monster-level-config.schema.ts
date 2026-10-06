import { z } from "zod";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

/**
 * Master data `monster_level_config`: tỉ lệ tăng mỗi level của từng chỉ số, dùng chung cho mọi monster.
 * Stat ở `level` = base (`monsters.stats`, mốc level 1) × (1 + `statsPerLevel[stat]` × (level − 1));
 * thiếu stat = không tăng theo level (vd. move_speed, critical_damage).
 */
export const MonsterLevelConfigSchema = z.object({
    statsPerLevel: z.partialRecord(z.enum(StatKey), z.number().nonnegative()).default({}),
});

export type MonsterLevelConfig = z.infer<typeof MonsterLevelConfigSchema>;
