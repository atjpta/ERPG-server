import {
    boolean,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import type { MailParams } from "@/modules/mails/schemas/mail-content.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";

/**
 * Gift code dùng chung: nhiều người cùng nhập một mã, mỗi nhân vật một lần (`gift_code_redemptions`). Nhập đúng thì quà gửi
 * vào hộp thư bằng thư hệ thống, không cộng thẳng vào túi. `code` luôn lưu IN HOA.
 */
export const GiftCodes = pgTable(
    "gift_codes",
    {
        ...baseColumns(),
        code: text("code").notNull(),
        /** Chỉ dùng được ở game server này; `null` = mọi server. */
        serverId: uuid("server_id").references(() => GameServers.id),
        /** Chưa đến giờ này thì chưa nhập được; `null` = dùng được ngay. */
        startsAt: timestamp("starts_at", { withTimezone: true }),
        /** Quá giờ này thì hết hạn; `null` = không hết hạn. */
        expiresAt: timestamp("expires_at", { withTimezone: true }),
        /** Tổng số lượt nhập của mọi nhân vật; `null` = không giới hạn. */
        maxUses: integer("max_uses"),
        usedCount: integer("used_count").notNull().default(0),
        /** Quà (item theo `itemCode`); `exp` phải 0 vì thư không cộng exp. */
        reward: jsonb("reward").$type<RewardSpec>().notNull(),
        /** Mẫu thư gửi kèm quà (`mail_templates.code`). */
        templateCode: text("template_code").notNull().default("gift_code"),
        params: jsonb("params").$type<MailParams>(),
        /** Tắt code mà không xoá (lịch sử nhập vẫn còn). */
        active: boolean("active").notNull().default(true),
        note: text("note"),
    },
    (table) => [uniqueIndex("gift_codes_code_unique").on(table.code)]
);

export type GiftCodeRow = typeof GiftCodes.$inferSelect;
export type NewGiftCodeRow = typeof GiftCodes.$inferInsert;
