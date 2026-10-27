import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { RecipeGroups } from "@/modules/crafting/entities/recipe-group.entity.js";

export class RecipeGroupRepository extends BaseRepository<typeof RecipeGroups> {
    constructor() {
        super(RecipeGroups);
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx
            .select()
            .from(RecipeGroups)
            .where(eq(RecipeGroups.enabled, true))
            .orderBy(asc(RecipeGroups.sortOrder), asc(RecipeGroups.code));
    }
}

export const RecipeGroupRepo = new RecipeGroupRepository();
