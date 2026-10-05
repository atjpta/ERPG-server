import { boolean, integer, jsonb, pgEnum, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";

export const mapTypeEnum = pgEnum("map_type", MapType);
export const mapStatusEnum = pgEnum("map_status", MapStatus);

/**
 * Metadata của 1 map (tile map vẽ bằng Tiled/LDtk ở phía client, `code` trùng tên file map).
 * Toạ độ trong game dùng đơn vị TILE (float) — client tự nhân `tileSize` khi render pixel.
 */
export const GameMaps = pgTable("game_maps", {
    ...baseWithCodeColumns(),
    name: text("name").notNull(),
    type: mapTypeEnum("type").notNull().default(MapType.FIELD),
    status: mapStatusEnum("status").notNull().default(MapStatus.ACTIVE),
    /** Kích thước map theo số tile. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Kích thước 1 tile (pixel) — thông tin cho client, server không dùng khi tính toán. */
    tileSize: integer("tile_size").notNull().default(16),
    spawnX: real("spawn_x").notNull(),
    spawnY: real("spawn_y").notNull(),
    /** Số người tối đa trong 1 instance (room) của map — đầy thì Colyseus tự tạo instance mới (kênh). */
    maxPlayersPerChannel: integer("max_players_per_channel").notNull().default(100),
    pvpEnabled: boolean("pvp_enabled").notNull().default(false),
    /** Monster sinh ra trong mỗi instance của map (theo `monsters.code`). */
    monsterSpawns: jsonb("monster_spawns").$type<MonsterSpawn[]>().notNull().default([]),
});

export interface MonsterSpawn {
    monsterCode: string;
    count: number;
}

export type GameMap = typeof GameMaps.$inferSelect;
export type NewGameMap = typeof GameMaps.$inferInsert;
