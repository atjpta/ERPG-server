import { jsonb, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { DialogueRule } from "@/modules/dialogues/schemas/dialogue.schema.js";
import type { NpcFunction } from "@/modules/npcs/schemas/npc-function.schema.js";

/**
 * NPC dùng chung nhiều map — vị trí đặt trong file map (`<mapCode>.map.json`). Tên hiển thị tra locale
 * theo `npc.{code}.name`.
 */
export const Npcs = pgTable("npcs", {
    ...baseWithCodeColumns(),
    /** Kích thước vùng chặn dưới chân NPC (tile) — cộng vào collider của map. */
    colliderWidth: real("collider_width").notNull().default(0.8),
    colliderHeight: real("collider_height").notNull().default(0.4),
    /** Khoảng cách tối đa (tile) để player nói chuyện. */
    interactRadius: real("interact_radius").notNull().default(2),
    /** Thoại khi không rule nào khớp. */
    defaultDialogueCode: text("default_dialogue_code"),
    /** Chọn thoại theo hoàn cảnh: rule thoả điều kiện có `priority` cao nhất thắng. */
    dialogueRules: jsonb("dialogue_rules").$type<DialogueRule[]>().notNull().default([]),
    functions: jsonb("functions").$type<NpcFunction[]>().notNull().default([]),
});

export type Npc = typeof Npcs.$inferSelect;
export type NewNpc = typeof Npcs.$inferInsert;
