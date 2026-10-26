import { NpcCode } from "@/modules/npcs/enums/npc-code.enum.js";
import { boolean, jsonb, pgEnum, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";
import type { DialogueRule } from "@/modules/dialogues/schemas/dialogue.schema.js";
import type { NpcFunction } from "@/modules/npcs/schemas/npc-function.schema.js";

export const npcKind = pgEnum("npc_kind", NpcKind);

/**
 * NPC dùng chung nhiều map — vị trí đặt trong file map (`<mapCode>.map.json`). Tên hiển thị tra locale
 * theo `npc.{code}.name`. Vật thể trong map (cổng, bệ teleport, bảng thông báo) cũng là NPC `kind = object`; cấu hình riêng
 * từng chỗ đặt (đích của cổng...) nằm ở slot của map, ghi đè `functions` này.
 */
export const Npcs = pgTable("npcs", {
    ...baseWithCodeColumns(NpcCode),
    /** `object` = vật thể trong map (cổng, bệ teleport...): không marker quest, không vùng chặn. */
    kind: npcKind("kind").notNull().default(NpcKind.NPC),
    /** Bấm vào là chạy luôn chức năng đầu tiên (của slot, hoặc của NPC), không mở thoại — dùng cho vật thể. */
    autoOpen: boolean("auto_open").notNull().default(false),
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
