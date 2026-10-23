import type { PlayerDatas } from "@/modules/player/entities/player-data.entity.js";

/**
 * Cột `player_states` mà `PlayerState` giữ và lưu (xem `PLAYER_GROUP_COLUMNS`): ví, túi / trang bị / điểm, level / exp / quest / cờ,
 * vị trí / HP / MP / dungeon. Không gồm khoá, class, hitbox, skills (chỉ đọc lúc đang chơi).
 */
export type PlayerSavedState = Pick<
    PlayerDatas,
    | "wallet"
    | "attributePoints"
    | "skillPoints"
    | "allocatedAttributes"
    | "equipments"
    | "equipmentInventory"
    | "consumableInventory"
    | "materialInventory"
    | "level"
    | "exp"
    | "flags"
    | "quests"
    | "dailyQuests"
    | "lastTownMapCode"
    | "mapCode"
    | "x"
    | "y"
    | "direction"
    | "hp"
    | "mp"
    | "dungeonSession"
>;
