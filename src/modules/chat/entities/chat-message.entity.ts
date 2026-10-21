import { index, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";

export const chatChannelEnum = pgEnum("chat_channel", ChatChannelKey);

/**
 * Lịch sử chat của các kênh có `saveHistory` trong master data `chat_config` (mặc định chỉ world + whisper).
 * `channel` là pg enum `chat_channel`: thêm kênh mới = thêm member `ChatChannelKey` rồi `yarn db:generate`.
 * Xoá player (xoá tài khoản) kéo theo tin họ gửi / nhận.
 */
export const ChatMessages = pgTable(
    "chat_messages",
    {
        ...baseColumns(),
        serverId: uuid("server_id")
            .notNull()
            .references(() => GameServers.id),
        channel: chatChannelEnum("channel").notNull(),
        senderPlayerId: uuid("sender_player_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
        /** Whisper: người nhận. */
        targetPlayerId: uuid("target_player_id").references(() => Players.id, {
            onDelete: "cascade",
        }),
        /** Phạm vi của kênh nếu có (vd guild id) — null với kênh toàn server / whisper. */
        scopeKey: text("scope_key"),
        content: text("content").notNull(),
        /** Dữ liệu riêng của từng kênh / kiểu tin (vd link item) — chưa dùng. */
        meta: jsonb("meta").$type<Record<string, unknown>>(),
    },
    (table) => [
        // Phân trang theo `id` (uuid v7, tăng theo thời gian): `id < before ORDER BY id DESC`.
        index("chat_messages_channel_idx").on(
            table.serverId,
            table.channel,
            table.scopeKey,
            table.id
        ),
        index("chat_messages_target_idx").on(table.targetPlayerId, table.id),
        index("chat_messages_sender_idx").on(table.senderPlayerId, table.id),
    ]
);

export type ChatMessageRow = typeof ChatMessages.$inferSelect;
/** Dòng lịch sử kèm tên hiện tại của người gửi (join `players`; bảng không lưu tên). */
export type ChatMessageWithSender = ChatMessageRow & { senderName: string };
export type NewChatMessageRow = typeof ChatMessages.$inferInsert;
