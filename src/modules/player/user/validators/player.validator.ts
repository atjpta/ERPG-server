import { z } from "zod";

export const RenamePlayerSchema = z.object({
    /** Chữ (kể cả tiếng Việt có dấu), số và `_`. */
    name: z
        .string()
        .trim()
        .min(3)
        .max(16)
        .regex(/^[\p{L}\p{N}_]+$/u, "Tên chỉ gồm chữ, số và _"),
});
export type RenamePlayerBody = z.infer<typeof RenamePlayerSchema>;
