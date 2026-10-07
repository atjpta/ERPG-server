import { jsonb, pgTable } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { DialogueNode } from "@/modules/dialogues/schemas/dialogue.schema.js";

/** Đồ thị thoại (node + option). Text không lưu ở đây — client tra locale theo key suy ra từ code. */
export const Dialogues = pgTable("dialogues", {
    ...baseWithCodeColumns(),
    nodes: jsonb("nodes").$type<DialogueNode[]>().notNull().default([]),
});

export type Dialogue = typeof Dialogues.$inferSelect;
export type NewDialogue = typeof Dialogues.$inferInsert;
