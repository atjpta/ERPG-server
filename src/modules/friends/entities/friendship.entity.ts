import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { FriendshipStatus } from "@/modules/friends/enums/friendship-status.enum.js";

export const friendshipStatusEnum = pgEnum("friendship_status", FriendshipStatus);

/**
 * Lời mời kết bạn và quan hệ bạn bè (cùng một game server — player đã thuộc đúng một server). Một dòng cho mỗi cặp
 * người chơi: `requesterId` là người gửi lời mời, `addresseeId` là người nhận; sau khi `accepted` hai bên ngang hàng.
 * Lời mời `pending` quá hạn (`friend_config.requestTtlDays`) coi như không tồn tại. Xoá player kéo theo xoá dòng.
 */
export const Friendships = pgTable(
    "friendships",
    {
        ...baseColumns(),
        requesterId: uuid("requester_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
        addresseeId: uuid("addressee_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
        status: friendshipStatusEnum("status").notNull().default(FriendshipStatus.PENDING),
        respondedAt: timestamp("responded_at", { withTimezone: true }),
    },
    (table) => [
        // Một dòng cho mỗi cặp, không phân biệt ai gửi.
        uniqueIndex("friendships_pair_unique").on(
            sql`least(${table.requesterId}, ${table.addresseeId})`,
            sql`greatest(${table.requesterId}, ${table.addresseeId})`
        ),
        index("friendships_requester_idx").on(table.requesterId, table.status),
        index("friendships_addressee_idx").on(table.addresseeId, table.status),
    ]
);

export type FriendshipRow = typeof Friendships.$inferSelect;
export type NewFriendshipRow = typeof Friendships.$inferInsert;
