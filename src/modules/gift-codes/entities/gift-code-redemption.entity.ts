import { index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { GiftCodes } from "@/modules/gift-codes/entities/gift-code.entity.js";

/**
 * "Nhân vật này đã nhập code này". Unique `(gift_code_id, player_id)` là chỗ chặn nhập hai lần (kể cả gọi đồng thời).
 * `mail_id` không phải khoá ngoại có chủ đích: người chơi xoá thư thì biên nhận còn, không nhập lại được.
 * Xoá nhân vật hoặc code kéo theo xoá biên nhận.
 */
export const GiftCodeRedemptions = pgTable(
    "gift_code_redemptions",
    {
        ...baseColumns(),
        giftCodeId: uuid("gift_code_id")
            .notNull()
            .references(() => GiftCodes.id, { onDelete: "cascade" }),
        playerId: uuid("player_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
        mailId: uuid("mail_id"),
    },
    (table) => [
        uniqueIndex("gift_code_redemptions_unique").on(table.giftCodeId, table.playerId),
        index("gift_code_redemptions_player_idx").on(table.playerId),
    ]
);

export type GiftCodeRedemptionRow = typeof GiftCodeRedemptions.$inferSelect;
