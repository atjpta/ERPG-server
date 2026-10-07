import { z } from "zod";
import { ActionSchema, ConditionSchema } from "@/modules/dialogues/schemas/condition.schema.js";

const idSchema = z.string().regex(/^[a-z0-9_]+$/);

export const DialogueOptionSchema = z.object({
    id: idSchema,
    /** Bỏ trống → `dialogue.{code}.{nodeId}.opt.{id}`. */
    textKey: z.string().optional(),
    conditions: z.array(ConditionSchema).optional(),
    /** Không thoả điều kiện: true = ẩn hẳn, false = hiện nhưng mờ (`enabled: false`). */
    hideIfFail: z.boolean().default(false),
    /** Node kế tiếp; bỏ trống = kết thúc thoại. */
    next: idSchema.optional(),
    actions: z.array(ActionSchema).optional(),
});

export const DialogueNodeSchema = z.object({
    id: idSchema,
    /** Bỏ trống → `dialogue.{code}.{id}.text`. */
    textKey: z.string().optional(),
    /** Người nói; bỏ trống → client dùng tên NPC. */
    speakerKey: z.string().optional(),
    /** Chạy ngay khi vào node, trước khi gửi cho client. */
    actions: z.array(ActionSchema).optional(),
    options: z.array(DialogueOptionSchema).optional(),
    /** Node kế tiếp khi không có option ("Tiếp tục"); bỏ trống = kết thúc. */
    next: idSchema.optional(),
});

export const DIALOGUE_START_NODE = "start";

export const DialogueNodesSchema = z.array(DialogueNodeSchema).min(1);
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;
export type DialogueOption = z.infer<typeof DialogueOptionSchema>;

export const DialogueRuleSchema = z.object({
    /** Bỏ trống = áp dụng ở mọi map. */
    mapCode: z.string().optional(),
    /** Số lớn được xét trước. */
    priority: z.number().int(),
    conditions: z.array(ConditionSchema).default([]),
    dialogueCode: z.string(),
});
export type DialogueRule = z.infer<typeof DialogueRuleSchema>;
