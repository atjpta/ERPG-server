import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";

export const AdminListUsersQuerySchema = PaginationSchema.extend({
    status: z.enum(UserStatus).optional(),
});
export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;

export const AdminBanUserSchema = z.object({
    reason: z.string().max(500).optional(),
    /** Số ngày ban — bỏ trống = ban vĩnh viễn. */
    durationDays: z.number().int().positive().optional(),
});
export type AdminBanUserBody = z.infer<typeof AdminBanUserSchema>;

export const AdminUserSessionParamSchema = z.object({
    id: z.uuidv7(),
    sessionId: z.uuidv7(),
});
