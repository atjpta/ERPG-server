import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";

export const userStatusEnum = pgEnum("user_status", UserStatus);

export const Users = pgTable("users", {
    ...baseColumns(),
    email: text("email").notNull().unique(),
    /** Nullable — tài khoản tạo qua Google (xem `user-oauth-account.entity.ts`) không có password. */
    password: text("password"),
    status: userStatusEnum("status").notNull().default(UserStatus.ACTIVE),
    /** Chỉ có ý nghĩa khi `status = BANNED`. */
    banReason: text("ban_reason"),
    /** null = ban vĩnh viễn. */
    banExpiresAt: timestamp("ban_expires_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type User = typeof Users.$inferSelect;
export type NewUser = typeof Users.$inferInsert;
