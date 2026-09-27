import { integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { GameServerStatus } from "@/modules/auth/enums/game-server.enum.js";

export const gameServerStatusEnum = pgEnum("game_server_status", GameServerStatus);

export const GameServers = pgTable("game_servers", {
    ...baseWithCodeColumns(),
    name: text("name").notNull(),
    status: gameServerStatusEnum("status").notNull().default(GameServerStatus.ONLINE),
    maxPlayers: integer("max_players").notNull().default(5000),
    sortOrder: integer("sort_order").notNull().default(0),
});

export type GameServer = typeof GameServers.$inferSelect;
export type NewGameServer = typeof GameServers.$inferInsert;
