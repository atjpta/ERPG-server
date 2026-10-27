import { integer, pgTable } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { RecipeGroupCode } from "@/modules/crafting/enums/recipe-group-code.enum.js";

/**
 * Nhóm công thức chế tạo. NPC có chức năng `crafting` giữ danh sách code nhóm (`config.recipeGroups`); công thức khai nhóm của nó
 * ở `crafting_recipes.group_codes`. Tên hiển thị tra locale `recipe_group.{code}.name`.
 */
export const RecipeGroups = pgTable("crafting_recipe_groups", {
    ...baseWithCodeColumns(RecipeGroupCode),
    /** Thứ tự hiển thị các nhóm trong màn hình chế tạo (nhỏ trước). */
    sortOrder: integer("sort_order").notNull().default(0),
});

export type RecipeGroup = typeof RecipeGroups.$inferSelect;
export type NewRecipeGroup = typeof RecipeGroups.$inferInsert;
