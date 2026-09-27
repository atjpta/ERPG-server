import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { Admins } from "@/modules/auth/entities/admin.entity.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import {
    AccountDeletionSource,
    AccountDeletionStatus,
} from "@/modules/auth/enums/account-deletion.enum.js";

export const accountDeletionSourceEnum = pgEnum("account_deletion_source", AccountDeletionSource);
export const accountDeletionStatusEnum = pgEnum("account_deletion_status", AccountDeletionStatus);

/**
 * Nhật ký yêu cầu xoá tài khoản (bắt buộc theo chính sách Google Play: xoá trong app + qua web).
 * Giữ lại sau khi xoá để chứng minh đã xử lý — không chứa dữ liệu game.
 */
export const AccountDeletionRequests = pgTable(
    "account_deletion_requests",
    {
        ...baseColumns(),
        /** null khi yêu cầu từ web chưa khớp được tài khoản. */
        userId: uuid("user_id").references(() => Users.id, { onDelete: "set null" }),
        /** Thông tin người gửi tự khai ở trang web (email và/hoặc tên nhân vật) để admin tìm tài khoản. */
        contactEmail: text("contact_email"),
        playerName: text("player_name"),
        reason: text("reason"),
        source: accountDeletionSourceEnum("source").notNull(),
        status: accountDeletionStatusEnum("status")
            .notNull()
            .default(AccountDeletionStatus.PENDING),
        processedAt: timestamp("processed_at", { withTimezone: true }),
        processedByAdminId: uuid("processed_by_admin_id").references(() => Admins.id),
        adminNote: text("admin_note"),
    },
    (table) => [index("account_deletion_requests_status_idx").on(table.status)]
);

export type AccountDeletionRequest = typeof AccountDeletionRequests.$inferSelect;
export type NewAccountDeletionRequest = typeof AccountDeletionRequests.$inferInsert;
