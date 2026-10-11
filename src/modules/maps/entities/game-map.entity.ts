import { boolean, integer, jsonb, pgEnum, pgTable, real, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { Condition } from "@/modules/dialogues/schemas/condition.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";
import type { MonsterSpawnType } from "@/modules/monsters/enums/monster-type.enum.js";

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

export interface DungeonRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DungeonPhase {
    id: string;
    /** Giây kể từ lúc chamber bắt đầu thì phase này spawn (phase đầu = 0). */
    delaySec: number;
    monsterSpawns: MonsterSpawn[];
}

/** "Chamber" = phòng trong dungeon (khác Colyseus room): đánh hết quái mọi phase mới qua phòng kế. */
export interface DungeonChamber {
    id: string;
    bounds: DungeonRect;
    /** Chỗ đặt player khi vào chamber (chamber đầu = nơi vào dungeon). */
    entry: { x: number; y: number };
    phases: DungeonPhase[];
    /** Cổng sang chamber kế — khoá tới khi chamber hoàn thành; chamber boss không có. */
    exit?: { x: number; y: number; radius: number };
    isBoss?: boolean;
    clearReward?: RewardSpec;
}

export interface DungeonConfig {
    /** Level quái = ceil(trung bình level người trong instance), tối đa giá trị này. */
    maxLevel: number;
    timeLimitSec?: number;
    chambers: DungeonChamber[];
    /** Thưởng khi clear chamber boss. */
    clearReward?: RewardSpec;
}

/**
 * Lượt vào dungeon đang diễn ra của player (`player_states.dungeon_session`): `mapCode/x/y` của map
 * trước khi vào được lưu trong `return*` để thoát ra về đúng chỗ; `instanceId` = room dungeon được phép join.
 */
export interface DungeonSession {
    dungeonCode: string;
    instanceId: string;
    returnMapCode: string;
    returnX: number;
    returnY: number;
}

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
    /** Diện mạo (client map sang prefab); bỏ trống = vẽ mặc định. */
    code?: InteractableCode;
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
    /** Marker (nhóm quái) mà spawn này thuộc về — các quái cùng marker đứng quanh điểm đó. */
    groupId?: string;
    monsterCode: string;
    count: number;
    /**
     * Vị trí sinh (đơn vị tile, gốc trên-trái như `spawnX/spawnY` của map). `count` > 1 → xếp hàng ngang
     * cách nhau `MONSTER_SPAWN_SPACING` ô. Bỏ trống → xếp chéo theo thứ tự (chỉ để thử).
     */
    spawnX?: number;
    spawnY?: number;
    /** Loại monster của spawn này — mặc định NORMAL; `random` = roll normal/elite mỗi lần sinh. */
    type?: MonsterSpawnType;
    /** Độ hiếm cố định; bỏ trống = random theo master data `monster_spawn_config`. */
    rarity?: ItemRarity;
    /** Khoảng level của quái sinh ra (map file đã điền sẵn từ `monsterLevel` của map); bỏ trống = level của monster. */
    minLevel?: number;
    maxLevel?: number;
}

export type GameMap = typeof GameMaps.$inferSelect;
export type NewGameMap = typeof GameMaps.$inferInsert;
