import { index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { MailBroadcasts } from "@/modules/mails/entities/mail-broadcast.entity.js";

/**
 * Biên nhận "broadcast này đã phát cho người chơi này". Tách khỏi `mails` có chủ đích: người chơi xoá thư thì thư mất nhưng biên
 * nhận còn, nên broadcast không bị phát lại (nếu suy ra "đã nhận" từ việc thư còn tồn tại thì xoá thư = nhận lại quà).
 * Xoá người chơi hoặc broadcast kéo theo xoá biên nhận.
 */
export const MailBroadcastReceipts = pgTable(
    "mail_broadcast_receipts",
    {
        ...baseColumns(),
        broadcastId: uuid("broadcast_id")
            .notNull()
            .references(() => MailBroadcasts.id, { onDelete: "cascade" }),
        playerId: uuid("player_id")
            .notNull()
            .references(() => Players.id, { onDelete: "cascade" }),
    },
    (table) => [
        uniqueIndex("mail_broadcast_receipts_unique").on(table.broadcastId, table.playerId),
        index("mail_broadcast_receipts_player_idx").on(table.playerId),
    ]
);
