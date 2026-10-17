import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { DialogueNodesSchema } from "@/modules/dialogues/schemas/dialogue.schema.js";

export const AdminListDialoguesQuerySchema = PaginationSchema;
export type AdminListDialoguesQuery = z.infer<typeof AdminListDialoguesQuerySchema>;

export const AdminCreateDialogueSchema = z.object({
    code: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_]+$/),
    enabled: z.boolean().optional(),
    nodes: DialogueNodesSchema,
});
export type AdminCreateDialogueBody = z.infer<typeof AdminCreateDialogueSchema>;

export const AdminUpdateDialogueSchema = AdminCreateDialogueSchema.omit({ code: true }).partial();
export type AdminUpdateDialogueBody = z.infer<typeof AdminUpdateDialogueSchema>;
