import { inArray } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { MailTemplates } from "@/modules/mails/entities/mail-template.entity.js";

export class MailTemplateRepository extends BaseRepository<typeof MailTemplates> {
    constructor() {
        super(MailTemplates);
    }

    async findByCodes(params: { codes: string[]; dbOrTx?: Queryable }) {
        const { codes, dbOrTx = db } = params;
        if (codes.length === 0) return [];
        return dbOrTx.select().from(MailTemplates).where(inArray(MailTemplates.code, codes));
    }
}

export const MailTemplateRepo = new MailTemplateRepository();
