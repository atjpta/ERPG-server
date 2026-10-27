import { RecipeGroups } from "@/modules/crafting/entities/recipe-group.entity.js";
import { Recipes } from "@/modules/crafting/entities/recipe.entity.js";
import { RecipeGroupRepo } from "@/modules/crafting/repositories/recipe-group.repository.js";
import { RecipeRepo } from "@/modules/crafting/repositories/recipe.repository.js";
import { RecipeDefinitionSchema } from "@/modules/crafting/schemas/recipe.schema.js";
import { RECIPE_GROUPS } from "@/modules/crafting/seeds/recipe-group.seed-data.js";
import { RECIPES } from "@/modules/crafting/seeds/recipe.seed-data.js";

/** Nhóm trước, công thức sau (công thức tham chiếu code nhóm; `ContentRefsCheck` kiểm chéo sau cùng). */
export const RecipeSeed = async () => {
    for (const group of RECIPE_GROUPS) {
        await RecipeGroupRepo.upsert({
            data: group,
            target: RecipeGroups.code,
            matchValue: group.code,
            updateData: group,
        });
    }
    for (const { code, ...definition } of RECIPES) {
        const data = { code, ...RecipeDefinitionSchema.parse(definition) };
        await RecipeRepo.upsert({
            data,
            target: Recipes.code,
            matchValue: code,
            updateData: data,
        });
    }
    console.info("✅ [RecipeSeed] Done");
};
