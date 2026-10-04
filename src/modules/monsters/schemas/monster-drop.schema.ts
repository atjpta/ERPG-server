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

export const ItemDropSchema = z.object({
    itemId: z.uuid(),
    quantity: z.number().int().positive(),
    /** Xác suất rơi (0 → 1). */
    rate: chance,
    /** Trọng số rarity khi rơi (0 → 1, tổng nên = 1); trống = rarity gốc của item. */
    rarity: z.partialRecord(z.enum(ItemRarity), chance).default({}),
});

/** Cột `drops` của monster. */
export const MonsterDropsSchema = z.object({
    currency: z.array(CurrencyDropSchema).default([]),
    items: z.array(ItemDropSchema).default([]),
    exp: z.number().int().nonnegative().default(0),
});

export type CurrencyDrop = z.infer<typeof CurrencyDropSchema>;
export type ItemDrop = z.infer<typeof ItemDropSchema>;
export type MonsterDrops = z.infer<typeof MonsterDropsSchema>;
