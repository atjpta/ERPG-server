import { boolean, integer, jsonb, pgEnum, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { Condition } from "@/modules/dialogues/schemas/condition.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";
import type { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

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

export interface MapNpc {
    npcCode: string;
    x: number;
    y: number;
    direction: "left" | "right";
}

interface MapInteractableBase {
    /** Id ổn định trong map — client và quest tham chiếu theo id này. */
    id: string;
    x: number;
    y: number;
    /** Khoảng cách tối đa (tile) để tương tác. */
    radius: number;
    conditions?: Condition[];
}

export interface MapPortal extends MapInteractableBase {
    type: "portal";
    targetMapCode: string;
    targetSpawnId: string;
}

export interface MapGatherable extends MapInteractableBase {
    type: "gather";
    reward: RewardSpec;
    /** Thu thập xong ẩn đi trong kênh, hiện lại sau chừng này giây. */
    respawnSec: number;
}

export interface MapSign extends MapInteractableBase {
    type: "sign";
    dialogueCode: string;
}

export type MapInteractable = MapPortal | MapGatherable | MapSign;

export enum MapSpawnKind {
    /** Chỗ vào map mặc định (spawn của `spawnX/spawnY`). */
    DEFAULT = "default",
    /** Chỗ player hồi sinh khi chết trong map. */
    RESPAWN = "respawn",
    /** Điểm đến của portal/teleport từ map khác. */
    ARRIVAL = "arrival",
}

export interface MapSpawnPoint {
    id: string;
    x: number;
    y: number;
    kind: MapSpawnKind;
}

/** Hình chữ nhật chặn đường (tile, gốc trên-trái, y hướng xuống). */
export interface MapCollider {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface MonsterSpawn {
    monsterCode: string;
    count: number;
    /**
     * Vị trí sinh (đơn vị tile, gốc trên-trái như `spawnX/spawnY` của map). `count` > 1 → xếp hàng ngang
     * cách nhau `MONSTER_SPAWN_SPACING` ô. Bỏ trống → xếp chéo theo thứ tự (chỉ để thử).
     */
    spawnX?: number;
    spawnY?: number;
    /** Loại monster của spawn này — mặc định NORMAL. */
    type?: MonsterType;
    /** Độ hiếm (màu tên phía client) — mặc định COMMON. */
    rarity?: ItemRarity;
}

export type GameMap = typeof GameMaps.$inferSelect;
export type NewGameMap = typeof GameMaps.$inferInsert;
