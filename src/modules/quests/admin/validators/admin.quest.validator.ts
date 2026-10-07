import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { QuestDefinitionSchema } from "@/modules/quests/schemas/quest.schema.js";

export const AdminListQuestsQuerySchema = PaginationSchema;
export type AdminListQuestsQuery = z.infer<typeof AdminListQuestsQuerySchema>;

export const AdminCreateQuestSchema = QuestDefinitionSchema.extend({
    code: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_]+$/),
    enabled: z.boolean().optional(),
});
export type AdminCreateQuestBody = z.infer<typeof AdminCreateQuestSchema>;

export const AdminUpdateQuestSchema = AdminCreateQuestSchema.omit({ code: true }).partial();
export type AdminUpdateQuestBody = z.infer<typeof AdminUpdateQuestSchema>;
