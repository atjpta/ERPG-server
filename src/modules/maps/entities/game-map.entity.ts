import { MapCode } from "@/modules/maps/enums/map-code.enum.js";
import { boolean, integer, jsonb, pgEnum, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";
import type {
    DungeonConfig,
    MapNpc,
    MapInteractable,
    MapSpawnPoint,
    MapCollider,
    MonsterSpawn,
} from "@/modules/maps/types/game-map.type.js";

export const mapTypeEnum = pgEnum("map_type", MapType);
export const mapStatusEnum = pgEnum("map_status", MapStatus);

/**
 * Metadata của 1 map (tile map vẽ bằng Tiled/LDtk ở phía client, `code` trùng tên file map).
 * Toạ độ trong game dùng đơn vị TILE (float) — client tự nhân `tileSize` khi render pixel.
 */
export const GameMaps = pgTable("game_maps", {
    ...baseWithCodeColumns(MapCode),
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
    /** Level tối thiểu để vào map — hiển thị "Lv X+" ở client, server chặn khi chuyển map. */
    minLevel: integer("min_level").notNull().default(1),
    /**
     * `false` = chưa có file `<code>.map.json` từ Unity, row chỉ là placeholder (inactive, không
     * layout) — server log cảnh báo lúc khởi động cho tới khi file được thêm và `yarn seed`.
     */
    layoutReady: boolean("layout_ready").notNull().default(true),
    /** Marker mà định nghĩa liệt kê nhưng file Unity chưa đặt vị trí (bị bỏ qua cho tới khi đủ). */
    missingMarkers: jsonb("missing_markers").$type<string[]>().notNull().default([]),
    /** Chỉ map `dungeon`: các chamber tuần tự, phase quái, level cap. */
    dungeon: jsonb("dungeon").$type<DungeonConfig>(),
    /** Monster sinh ra trong mỗi instance của map (theo `monsters.code`). */
    monsterSpawns: jsonb("monster_spawns").$type<MonsterSpawn[]>().notNull().default([]),
    /** Điểm đặt player theo id ổn định (spawn mặc định, hồi sinh, điểm đến của portal...). */
    spawnPoints: jsonb("spawn_points").$type<MapSpawnPoint[]>().notNull().default([]),
    /** Vùng chặn tĩnh (tile) — server chặn di chuyển, client dự đoán cùng dữ liệu. */
    colliders: jsonb("colliders").$type<MapCollider[]>().notNull().default([]),
    /** Hash nội dung file `<code>.map.json` đã seed — client so với bản trong build để phát hiện lệch. */
    contentHash: text("content_hash").notNull().default(""),
    /** NPC đặt trong map (NPC dùng chung nhiều map — định nghĩa ở bảng `npcs`). */
    npcs: jsonb("npcs").$type<MapNpc[]>().notNull().default([]),
    /** Vật thể tương tác được: portal, thu thập, biển báo. */
    interactables: jsonb("interactables").$type<MapInteractable[]>().notNull().default([]),
});

export type GameMap = typeof GameMaps.$inferSelect;
export type NewGameMap = typeof GameMaps.$inferInsert;
