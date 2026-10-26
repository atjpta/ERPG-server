import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { DialogueRuleSchema } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { NpcKind } from "@/modules/npcs/enums/npc-kind.enum.js";
import { NpcFunctionSchema } from "@/modules/npcs/schemas/npc-function.schema.js";

export const AdminListNpcsQuerySchema = PaginationSchema;
export type AdminListNpcsQuery = z.infer<typeof AdminListNpcsQuerySchema>;

export const AdminCreateNpcSchema = z.object({
    code: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_]+$/),
    enabled: z.boolean().optional(),
    kind: z.enum(NpcKind).optional(),
    autoOpen: z.boolean().optional(),
    defaultDialogueCode: z.string().min(1).nullable().optional(),
    dialogueRules: z.array(DialogueRuleSchema).optional(),
    functions: z.array(NpcFunctionSchema).optional(),
});
export type AdminCreateNpcBody = z.infer<typeof AdminCreateNpcSchema>;

export const AdminUpdateNpcSchema = AdminCreateNpcSchema.omit({ code: true }).partial();
export type AdminUpdateNpcBody = z.infer<typeof AdminUpdateNpcSchema>;
