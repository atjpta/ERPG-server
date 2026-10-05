import { z } from "zod";

/** Chữ (kể cả tiếng Việt có dấu), số và `_`. */
const PlayerNameSchema = z
    .string()
    .trim()
    .min(3)
    .max(16)
    .regex(/^[\p{L}\p{N}_]+$/u, "Tên chỉ gồm chữ, số và _");

export const RenamePlayerSchema = z.object({ name: PlayerNameSchema });
export type RenamePlayerBody = z.infer<typeof RenamePlayerSchema>;

export const CreatePlayerSchema = z.object({
    name: PlayerNameSchema,
    /** Class khởi đầu (tier 1): guardian / swordman / archer / mage. */
    classCode: z.string().min(1),
});
export type CreatePlayerBody = z.infer<typeof CreatePlayerSchema>;
