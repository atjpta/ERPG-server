import { z } from "zod";

export const DeleteMyAccountSchema = z.object({
    reason: z.string().trim().max(500).optional(),
});
export type DeleteMyAccountBody = z.infer<typeof DeleteMyAccountSchema>;

/** Form trên trang web xoá tài khoản — cần ít nhất email hoặc tên nhân vật để admin tìm. */
export const WebAccountDeletionSchema = z
    .object({
        contactEmail: z.email().optional(),
        playerName: z.string().trim().min(1).max(32).optional(),
        reason: z.string().trim().max(500).optional(),
    })
    .refine((body) => body.contactEmail || body.playerName, {
        message: "Cần nhập email hoặc tên nhân vật",
    });
export type WebAccountDeletionBody = z.infer<typeof WebAccountDeletionSchema>;
