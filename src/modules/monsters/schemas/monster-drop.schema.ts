import { z } from "zod";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

const chance = z.number().min(0).max(1);

export const CurrencyDropSchema = z
    .object({
        code: z.enum(CurrencyCode),
        min: z.number().int().nonnegative(),
        max: z.number().int().nonnegative(),
    })
    .refine((drop) => drop.min <= drop.max, { message: "min must be <= max" });

/** Item thường (material, consumable): số lượng random trong [min, max]. */
export const ItemDropSchema = z
    .object({
        itemId: z.uuid(),
        min: z.number().int().positive(),
        max: z.number().int().positive(),
        /** Xác suất rơi (0 → 1). */
        rate: chance,
    })
    .refine((drop) => drop.min <= drop.max, { message: "min must be <= max" });

/**
 * Trang bị biome của monster: chọn ngẫu nhiên 1 món (class + loại) trong bộ đồ của biome, level theo
 * `equipment_drop_config`, rarity theo trọng số.
 */
export const EquipmentDropSchema = z.object({
    rate: chance,
    /** Trọng số rarity (không cần tổng = 1); trống = common. */
    rarity: z.partialRecord(z.enum(ItemRarity), z.number().nonnegative()).default({}),
});

/** Cột `drops` của monster. */
export const MonsterDropsSchema = z.object({
    currency: z.array(CurrencyDropSchema).default([]),
    items: z.array(ItemDropSchema).default([]),
    equipment: EquipmentDropSchema.optional(),
    exp: z.number().int().nonnegative().default(0),
});

export type CurrencyDrop = z.infer<typeof CurrencyDropSchema>;
export type ItemDrop = z.infer<typeof ItemDropSchema>;
export type EquipmentDrop = z.infer<typeof EquipmentDropSchema>;
export type MonsterDrops = z.infer<typeof MonsterDropsSchema>;
