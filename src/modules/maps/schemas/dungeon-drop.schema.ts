import { z } from "zod";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";

const multiplier = z.number().nonnegative();
const chance = z.number().min(0).max(1);

/**
 * Thưởng thêm khi **hạ boss** của 1 dungeon, so với bảng drop gốc của monster boss. Quái thường trong
 * dungeon rớt như bình thường (không áp dụng các chỉnh này).
 */
export const DungeonDropTuningSchema = z.object({
    /** Nhân exp / tiền / tỉ lệ rơi của boss (mặc định 1). */
    expMultiplier: multiplier.optional(),
    goldMultiplier: multiplier.optional(),
    dropRateMultiplier: multiplier.optional(),
    /** Ghi đè tỉ lệ rơi trang bị gốc và trọng số rarity; bỏ trống = giữ của monster. */
    equipmentRate: chance.optional(),
    equipmentRarity: z.partialRecord(z.enum(ItemRarity), z.number().nonnegative()).optional(),
    /** Item rơi thêm khi hạ boss, ngoài bảng drop của monster. */
    extraItems: z
        .array(
            z
                .object({
                    itemCode: z.string().min(1),
                    min: z.number().int().positive(),
                    max: z.number().int().positive(),
                    rate: chance,
                })
                .refine((drop) => drop.min <= drop.max, { message: "min must be <= max" })
        )
        .optional(),
});
export type DungeonDropTuning = z.infer<typeof DungeonDropTuningSchema>;

/** Master data `dungeon_drop_config`: thưởng thêm khi hạ boss theo code map dungeon (admin sửa được, không nằm trong file map Unity). */
export const DungeonDropConfigSchema = z.object({
    byMap: z.record(z.string(), DungeonDropTuningSchema),
});
export type DungeonDropConfig = z.infer<typeof DungeonDropConfigSchema>;
