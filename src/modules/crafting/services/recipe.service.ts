import type { RecipeGroup } from "@/modules/crafting/entities/recipe-group.entity.js";
import type { Recipe } from "@/modules/crafting/entities/recipe.entity.js";
import { RecipeGroupRepo } from "@/modules/crafting/repositories/recipe-group.repository.js";
import { RecipeRepo } from "@/modules/crafting/repositories/recipe.repository.js";

/** Cache công thức + nhóm công thức (nạp lúc khởi động, như `npcService`). */
export class RecipeService {
    private readonly recipes = new Map<string, Recipe>();
    private readonly groups = new Map<string, RecipeGroup>();

    async setCacheData() {
        const [recipes, groups] = await Promise.all([
            RecipeRepo.findEnabled(),
            RecipeGroupRepo.findEnabled(),
        ]);
        this.recipes.clear();
        this.groups.clear();
        for (const row of recipes) this.recipes.set(row.code, row);
        for (const row of groups) this.groups.set(row.code, row);
        console.log(`Cached ${recipes.length} recipes in ${groups.length} recipe groups`);
    }

    getByCode(code: string): Recipe | undefined {
        return this.recipes.get(code);
    }

    groupExists(code: string): boolean {
        return this.groups.has(code);
    }

    listGroups(): readonly RecipeGroup[] {
        return [...this.groups.values()];
    }

    /** Công thức thuộc nhóm `groupCode`, theo thứ tự hiển thị. */
    listByGroup(groupCode: string): Recipe[] {
        return [...this.recipes.values()].filter((recipe) => recipe.groupCodes.includes(groupCode));
    }

    /** Công thức có thuộc ít nhất một nhóm trong `groupCodes` không (NPC chế được nhóm nào). */
    isOffered(recipe: Pick<Recipe, "groupCodes">, groupCodes: readonly string[]): boolean {
        return recipe.groupCodes.some((code) => groupCodes.includes(code));
    }
}

export const recipeService = new RecipeService();
