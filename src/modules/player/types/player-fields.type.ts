import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";

/**
 * Cột `player_states` mà `PlayerRuntime` giữ và lưu (xem `PLAYER_GROUP_COLUMNS`): ví, túi / trang bị / điểm, level / exp / quest / cờ,
 * vị trí / HP / MP / dungeon. Không gồm khoá, class, hitbox, skills (chỉ đọc lúc đang chơi).
 */
export type PlayerSavedState = Pick<
    PlayerState,
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
