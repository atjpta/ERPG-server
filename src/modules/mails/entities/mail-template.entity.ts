import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import type { MailContent } from "@/modules/mails/schemas/mail-content.schema.js";

/** Mẫu thư hệ thống đa ngôn ngữ, tham chiếu bằng `code` (seed `mail-template.seed.ts`). Thêm mẫu = thêm dòng, không đổi client. */
export const MailTemplates = pgTable("mail_templates", {
    ...baseColumns(),
    code: text("code").notNull().unique(),
    content: jsonb("content").$type<MailContent>().notNull(),
    note: text("note"),
});

export type MailTemplateRow = typeof MailTemplates.$inferSelect;
