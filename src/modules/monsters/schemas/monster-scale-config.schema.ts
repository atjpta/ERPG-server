import { z } from "zod";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

/** Hệ số nhân cho 1 loại / 1 độ hiếm monster. */
export const MonsterScaleEntrySchema = z.object({
    /** Nhân từng chỉ số (stat cuối sau khi cộng theo level); thiếu = ×1. */
    stats: z.partialRecord(z.enum(StatKey), z.number().nonnegative()).default({}),
    /** Nhân exp nhận được. */
    exp: z.number().nonnegative(),
    /** Nhân số tiền rơi ra. */
    gold: z.number().nonnegative(),
    /** Nhân tỉ lệ rơi item + trang bị (kết quả tối đa 1). */
    dropRate: z.number().nonnegative(),
    /** Nhân kích thước: sprite (client), hitbox, collider và vùng đánh; thiếu = ×1. */
    size: z.number().positive().default(1),
});

/**
 * Master data `monster_scale_config`: chỉ số + thưởng của monster nhân theo loại và độ hiếm (cấu hình
 * theo spawn — `game_maps.monsterSpawns`) — 2 hệ số nhân với nhau.
 */
export const MonsterScaleConfigSchema = z.object({
    byType: z.record(z.enum(MonsterType), MonsterScaleEntrySchema),
    byRarity: z.record(z.enum(ItemRarity), MonsterScaleEntrySchema),
});

export type MonsterScaleEntry = z.infer<typeof MonsterScaleEntrySchema>;
export type MonsterScaleConfig = z.infer<typeof MonsterScaleConfigSchema>;
