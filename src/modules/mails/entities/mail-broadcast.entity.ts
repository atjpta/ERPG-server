import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import type { MailContent, MailParams } from "@/modules/mails/schemas/mail-content.schema.js";
import type { MailReward } from "@/modules/rewards/schemas/mail-reward.schema.js";

/**
 * Mẫu thư gửi cả server (thông báo, quà sự kiện). Không fan-out lúc tạo: mỗi người nhận một dòng `mails` khi họ vào
 * game / mở hộp thư (`MailService.materializeBroadcasts`) nếu broadcast còn hạn. Thư gửi riêng từng người chơi KHÔNG
 * đi qua bảng này mà ghi thẳng vào `mails`.
 */
export const MailBroadcasts = pgTable("mail_broadcasts", {
    ...baseColumns(),
    serverId: uuid("server_id")
        .notNull()
        .references(() => GameServers.id),
    templateCode: text("template_code"),
    params: jsonb("params").$type<MailParams>(),
    content: jsonb("content").$type<MailContent>(),
    reward: jsonb("reward").$type<MailReward>(),
    /** Người tạo nhân vật sau khi broadcast được tạo không nhận. */
    skipNewPlayers: boolean("skip_new_players").notNull().default(false),
    /** Hạn của broadcast (sau đó không phát thêm); hạn của từng thư tính từ lúc phát. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type MailBroadcastRow = typeof MailBroadcasts.$inferSelect;
export type NewMailBroadcastRow = typeof MailBroadcasts.$inferInsert;
