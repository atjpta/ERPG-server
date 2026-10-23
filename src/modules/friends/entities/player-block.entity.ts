import { index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";

/**
 * Danh sách chặn (một chiều): `blockerId` chặn `blockedId`. Người bị chặn không gửi được lời mời kết bạn, mời party
 * hay nhắn riêng cho người chặn. Xoá player kéo theo xoá dòng.
 */
export const PlayerBlocks = pgTable(
    "player_blocks",
    {
        ...baseColumns(),
        blockerId: uuid("blocker_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
        blockedId: uuid("blocked_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
    },
    (table) => [
        uniqueIndex("player_blocks_pair_unique").on(table.blockerId, table.blockedId),
        index("player_blocks_blocked_idx").on(table.blockedId),
    ]
);

export type PlayerBlockRow = typeof PlayerBlocks.$inferSelect;
