import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { RecipeCode } from "@/modules/crafting/enums/recipe-code.enum.js";
import type { RecipeIngredient } from "@/modules/crafting/schemas/recipe.schema.js";
import { ItemCode } from "@/modules/items/enums/item-code.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";

/** Công thức chế tạo: nguyên liệu (có thứ tự hiển thị) + tiền → item. Tên hiển thị tra locale `recipe.{code}.name`. */
export const Recipes = pgTable("crafting_recipes", {
    ...baseWithCodeColumns(RecipeCode),
    /** Code các nhóm (`crafting_recipe_groups.code`) chứa công thức; một công thức thuộc nhiều nhóm được. */
    groupCodes: jsonb("group_codes").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    requiredLevel: integer("required_level").notNull().default(1),
    resultItemCode: text("result_item_code", {
        enum: Object.values(ItemCode) as [ItemCode, ...ItemCode[]],
    }).notNull(),
    resultQuantity: integer("result_quantity").notNull().default(1),
    /** Trang bị không có `resultMetadata`: roll ngẫu nhiên ở level / rarity này. */
    resultLevel: integer("result_level"),
    resultRarity: text("result_rarity", {
        enum: Object.values(ItemRarity) as [ItemRarity, ...ItemRarity[]],
    }),
    /** Trang bị có chỉ số cố định: nhúng nguyên metadata của món sẽ tạo ra. */
    resultMetadata: jsonb("result_metadata").$type<ItemEquipmentInstanceMetadata>(),
    ingredients: jsonb("ingredients").$type<RecipeIngredient[]>().notNull().default([]),
    cost: jsonb("cost").$type<CurrencyReward[]>().notNull().default([]),
});

export type Recipe = typeof Recipes.$inferSelect;
export type NewRecipe = typeof Recipes.$inferInsert;
