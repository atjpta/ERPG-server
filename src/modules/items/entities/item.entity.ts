import { boolean, integer, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemMetadata } from "@/modules/items/schemas/item-metadata.schema.js";

export const itemTypeEnum = pgEnum("item_type", ItemType);
export const itemRarityEnum = pgEnum("item_rarity", ItemRarity);

/** Catalog item. `metadata` validate theo `type` (xem parseItemMetadata). */
export const Items = pgTable("items", {
    ...baseWithCodeColumns(),
    name: text("name").notNull(),
    type: itemTypeEnum("type").notNull(),
    /** Rarity gốc; bản rơi ra có thể roll rarity khác (ItemEquipmentInstanceMetadata.rarity). */
    rarity: itemRarityEnum("rarity").notNull().default(ItemRarity.COMMON),
    requiredLevel: integer("required_level").notNull().default(1),
    stackable: boolean("stackable").notNull().default(false),
    /** Số lượng tối đa trong 1 ô inventory (1 nếu không stackable). */
    maxStack: integer("max_stack").notNull().default(1),
    /** Giá bán cho NPC, tính bằng GOLD. */
    sellPrice: integer("sell_price").notNull().default(0),
    metadata: jsonb("metadata").$type<ItemMetadata>().notNull().default({}),
});

export type Item = typeof Items.$inferSelect;
export type NewItem = typeof Items.$inferInsert;
