import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Skills } from "@/modules/skills/entities/skill.entity.js";

export class SkillRepository extends BaseRepository<typeof Skills> {
    constructor() {
        super(Skills);
    }

    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Skills.code, params.code), dbOrTx: params.dbOrTx });
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx
            .select()
            .from(Skills)
            .where(eq(Skills.enabled, true))
            .orderBy(asc(Skills.code));
    }
}

export const SkillRepo = new SkillRepository();
