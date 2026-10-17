import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import {
    AccountDeletionSource,
    AccountDeletionStatus,
} from "@/modules/auth/enums/account-deletion.enum.js";

export const AdminListAccountDeletionQuerySchema = PaginationSchema.extend({
    status: z.enum(AccountDeletionStatus).optional(),
    source: z.enum(AccountDeletionSource).optional(),
});
export type AdminListAccountDeletionQuery = z.infer<typeof AdminListAccountDeletionQuerySchema>;

/** `userId` bắt buộc nếu yêu cầu chưa khớp được tài khoản (admin tự tìm theo email/tên nhân vật). */
export const AdminCompleteAccountDeletionSchema = z.object({
    userId: z.uuidv7().optional(),
    note: z.string().trim().max(500).optional(),
});
export type AdminCompleteAccountDeletionBody = z.infer<typeof AdminCompleteAccountDeletionSchema>;

export const AdminRejectAccountDeletionSchema = z.object({
    note: z.string().trim().min(1).max(500),
});
export type AdminRejectAccountDeletionBody = z.infer<typeof AdminRejectAccountDeletionSchema>;
