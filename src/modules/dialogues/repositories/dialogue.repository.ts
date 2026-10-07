import { asc, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Dialogues } from "@/modules/dialogues/entities/dialogue.entity.js";

export class DialogueRepository extends BaseRepository<typeof Dialogues> {
    constructor() {
        super(Dialogues);
    }

    findByCode(params: { code: string; dbOrTx?: Queryable }) {
        return this.findOne({ where: eq(Dialogues.code, params.code), dbOrTx: params.dbOrTx });
    }

    async findEnabled(params: { dbOrTx?: Queryable } = {}) {
        const dbOrTx = params.dbOrTx ?? db;
        return dbOrTx
            .select()
            .from(Dialogues)
            .where(eq(Dialogues.enabled, true))
            .orderBy(asc(Dialogues.code));
    }
}

export const DialogueRepo = new DialogueRepository();
