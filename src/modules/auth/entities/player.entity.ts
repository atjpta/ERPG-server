import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";

export const playerStatusEnum = pgEnum("player_status", PlayerStatus);

/** Account-facing player identity and access status. Gameplay progression lives in player_states. */
export const Players = pgTable(
    "players",
    {
        ...baseColumns(),
        userId: uuid("user_id")
            .notNull()
            .references(() => Users.id),
        serverId: uuid("server_id")
            .notNull()
            .references(() => GameServers.id),
        name: text("name").notNull(),
        status: playerStatusEnum("status").notNull().default(PlayerStatus.ACTIVE),
        banReason: text("ban_reason"),
        lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    },
    (table) => [
        uniqueIndex("players_server_id_name_lower_unique").on(
            table.serverId,
            sql`lower(${table.name})`
        ),
        index("players_user_id_idx").on(table.userId),
    ]
);

export type PlayerIdentity = typeof Players.$inferSelect;
export type NewPlayerIdentity = typeof Players.$inferInsert;
