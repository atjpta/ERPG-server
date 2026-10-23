import {
    index,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { MailBroadcasts } from "@/modules/mails/entities/mail-broadcast.entity.js";
import { MailKind } from "@/modules/mails/enums/mail-kind.enum.js";
import type { MailContent, MailParams } from "@/modules/mails/schemas/mail-content.schema.js";
import type { MailCod, MailReward } from "@/modules/rewards/schemas/mail-reward.schema.js";

export const mailKindEnum = pgEnum("mail_kind", MailKind);

/**
 * Hộp thư: một dòng cho mỗi người nhận. Nội dung là một trong ba dạng — `templateCode` + `params` (mẫu thư, đa ngôn ngữ),
 * `content` (đa ngôn ngữ viết thẳng, thư admin) hoặc `subject` / `body` (thư người chơi, giữ nguyên chữ người gửi).
 * `reward` là đính kèm (cùng hình `Reward` của quái rớt / quest...), `cod` là giá người nhận phải trả mới lấy được nó.
 * Xoá người nhận kéo theo xoá thư; xoá người gửi chỉ làm mất liên kết (`senderName` là bản chụp tên).
 */
export const Mails = pgTable(
    "mails",
    {
        ...baseColumns(),
        serverId: uuid("server_id")
            .notNull()
            .references(() => GameServers.id),
        recipientPlayerId: uuid("recipient_player_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
        kind: mailKindEnum("kind").notNull(),
        senderPlayerId: uuid("sender_player_id").references(() => Players.id, {
            onDelete: "set null",
        }),
        senderName: text("sender_name"),
        templateCode: text("template_code"),
        params: jsonb("params").$type<MailParams>(),
        content: jsonb("content").$type<MailContent>(),
        subject: text("subject"),
        body: text("body"),
        reward: jsonb("reward").$type<MailReward>(),
        cod: jsonb("cod").$type<MailCod>(),
        /** Thư sinh ra từ một broadcast (phát lười lúc vào game). */
        broadcastId: uuid("broadcast_id").references(() => MailBroadcasts.id, {
            onDelete: "cascade",
        }),
        readAt: timestamp("read_at", { withTimezone: true }),
        claimedAt: timestamp("claimed_at", { withTimezone: true }),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    },
    (table) => [
        // Phân trang / sắp xếp theo `id` (uuid v7, tăng theo thời gian).
        index("mails_recipient_idx").on(table.recipientPlayerId, table.id),
        index("mails_sender_idx").on(table.senderPlayerId, table.claimedAt),
        index("mails_expires_idx").on(table.expiresAt),
        // Mỗi broadcast chỉ phát một lần cho mỗi người (NULL không đụng nhau nên thư thường không bị ảnh hưởng).
        uniqueIndex("mails_broadcast_recipient_unique").on(
            table.broadcastId,
            table.recipientPlayerId
        ),
    ]
);

export type MailRow = typeof Mails.$inferSelect;
export type NewMailRow = typeof Mails.$inferInsert;
