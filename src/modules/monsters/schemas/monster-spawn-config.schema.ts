import { z } from "zod";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

/**
 * Master data `monster_spawn_config`: cách server roll biến thể (loại + độ hiếm) của monster mỗi lần
 * sinh / hồi sinh. Loại và độ hiếm của từng spawn trong map file có thể cố định; không cố định thì roll ở đây.
 */
export const MonsterSpawnConfigSchema = z.object({
    /** Số elite tối đa còn sống cùng lúc trong 1 map khi roll từ spawn `random` (0 = không có elite random). */
    maxElitesPerMap: z.number().int().min(0),
    /** Xác suất spawn `random` ra elite (0 → 1); trượt hoặc map đã đủ elite thì ra normal. */
    eliteChance: z.number().min(0).max(1),
    /** Trọng số độ hiếm theo loại monster (không cần tổng = 1); mỗi loại phải có ít nhất 1 trọng số > 0. */
    rarityWeights: z
        .record(z.enum(MonsterType), z.partialRecord(z.enum(ItemRarity), z.number().nonnegative()))
        .refine(
            (weights) =>
                Object.values(weights).every((byRarity) =>
                    Object.values(byRarity).some((weight) => weight > 0)
                ),
            { message: "each monster type needs at least one rarity weight > 0" }
        ),
});

export type MonsterSpawnConfig = z.infer<typeof MonsterSpawnConfigSchema>;
