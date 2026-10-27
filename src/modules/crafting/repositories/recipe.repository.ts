import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Recipes } from "@/modules/crafting/entities/recipe.entity.js";

export class RecipeRepository extends BaseRepository<typeof Recipes> {
    constructor() {
        super(Recipes);
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx
            .select()
            .from(Recipes)
            .where(eq(Recipes.enabled, true))
            .orderBy(asc(Recipes.sortOrder), asc(Recipes.code));
    }
}

export const RecipeRepo = new RecipeRepository();
