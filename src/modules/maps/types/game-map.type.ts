import type { Condition } from "@/modules/dialogues/schemas/condition.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { InteractableCode } from "@/modules/maps/enums/interactable-code.enum.js";
import type { MonsterSpawnType } from "@/modules/monsters/enums/monster-type.enum.js";
import { MapSpawnKind } from "@/modules/maps/enums/game-map.enum.js";

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
    /** Chỗ đặt player khi vào chamber (chamber đầu = spawn `default` của dungeon, không cần khai trong layout). */
    entry: { x: number; y: number };
    /** Cổng chắn sau lưng chỗ vào và trước lối ra: chặn đường tới khi chamber dọn xong. */
    entryGate?: DungeonRect;
    exitGate?: DungeonRect;
    phases: DungeonPhase[];
    /** Cổng sang chamber kế — khoá tới khi chamber hoàn thành; chamber boss không có. */
    exit?: { x: number; y: number; radius: number };
    isBoss?: boolean;
}

export interface DungeonConfig {
    /** Level quái = ceil(trung bình level người trong instance), tối đa giá trị này. */
    maxLevel: number;
    timeLimitSec?: number;
    /** Diện mạo cổng chắn (client chọn prefab). */
    gateCode?: string;
    chambers: DungeonChamber[];
    /** Thưởng khi clear chamber boss: phần cố định + item rơi thêm + trang bị biome chia nhau `slots`. */
    clearReward?: DungeonClearReward;
}

export interface DungeonClearReward extends RewardSpec {
    slots?: number;
    dropItems: { itemCode: string; min: number; max: number; rate: number }[];
    equipment?: { biome: Biome; rarity: Partial<Record<ItemRarity, number>> };
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
    /** Hướng mũi tên của portal (layout Unity chọn). */
    direction?: "up" | "down" | "left" | "right";
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

/** Bệ teleport (dịch chuyển nhanh giữa các map có teleport). */
export interface MapTeleport extends MapInteractableBase {
    type: "teleport";
    /** Ai cũng teleport tới map này được: bỏ điều kiện "đã từng đến" (vẫn kiểm level). */
    openToAll?: boolean;
}

export type MapInteractable = MapPortal | MapGatherable | MapSign | MapTeleport;

export interface MapSpawnPoint {
    id: string;
    x: number;
    y: number;
    kind: MapSpawnKind;
}

/** Hình chữ nhật chặn đường (tile, gốc ở giữa map, y hướng lên). `x`, `y` là góc nhỏ nhất (dưới-trái), trải tới `x + w`, `y + h`. */
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
     * Vị trí sinh (đơn vị tile, gốc ở giữa map, y hướng lên, như `spawnX/spawnY` của map). `count` > 1 → xếp hàng ngang
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
    /** Quá chừng này giây không nhận sát thương thì hồi đầy máu (bù nhìn phòng tập); bỏ trống = không hồi. */
    healAfterIdleSec?: number;
}
