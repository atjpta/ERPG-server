import { sql } from "drizzle-orm";
import {
    bigint,
    index,
    integer,
    pgEnum,
    pgTable,
    real,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";
import { baseColumns } from "@/core/entities/base.entity.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import { Direction, PlayerStatus } from "@/modules/auth/enums/player.enum.js";

export const playerStatusEnum = pgEnum("player_status", PlayerStatus);
export const directionEnum = pgEnum("direction", Direction);

/**
 * Nhân vật trong game. Schema cho phép 1 user có nhiều player (nhiều server/nhiều nhân vật),
 * nhưng hiện tại logic đang là 1:1 — player tự tạo ở lần login đầu (xem `PlayerService.ensureDefault`).
 */
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
        level: integer("level").notNull().default(1),
        exp: bigint("exp", { mode: "number" }).notNull().default(0),
        hp: integer("hp").notNull(),
        mp: integer("mp").notNull(),
        /** Vị trí lưu lại khi rời map/logout — đơn vị tile (xem `game-map.entity.ts`). */
        mapCode: text("map_code").notNull(),
        x: real("x").notNull(),
        y: real("y").notNull(),
        direction: directionEnum("direction").notNull().default(Direction.DOWN),
        banReason: text("ban_reason"),
        lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    },
    (table) => [
        /** Tên unique theo server, không phân biệt hoa thường. */
        uniqueIndex("players_server_id_name_lower_unique").on(
            table.serverId,
            sql`lower(${table.name})`
        ),
        index("players_user_id_idx").on(table.userId),
    ]
);

export type Player = typeof Players.$inferSelect;
export type NewPlayer = typeof Players.$inferInsert;
