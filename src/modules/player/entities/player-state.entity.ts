import {
    bigint,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    real,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { DateTime } from "luxon";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { Direction } from "@/modules/player/enums/player.enum.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";

export const directionEnum = pgEnum("direction", Direction);

/** Trạng thái gameplay có thể thay đổi liên tục và được khôi phục khi player vào game. */
export const PlayerStates = pgTable("player_states", {
    playerId: uuid("player_id")
        .primaryKey()
        .references(() => Players.id, { onDelete: "cascade" }),
    level: integer("level").notNull().default(1),
    exp: bigint("exp", { mode: "number" }).notNull().default(0),
    mapCode: text("map_code")
        .notNull()
        .references(() => GameMaps.code, { onDelete: "restrict" }),
    x: real("x").notNull(),
    y: real("y").notNull(),
    direction: directionEnum("direction").notNull().default(Direction.DOWN),
    hp: integer("hp").notNull(),
    mp: integer("mp").notNull(),
    hitbox: jsonb("hitbox").$type<CollisionBounds>().notNull().default({ width: 0.8, height: 0.8 }),
    collider: jsonb("collider")
        .$type<CollisionBounds>()
        .notNull()
        .default({ width: 0.8, height: 0.2 }),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => DateTime.now().toJSDate()),
});

export type PlayerState = typeof PlayerStates.$inferSelect;
export type NewPlayerState = typeof PlayerStates.$inferInsert;
