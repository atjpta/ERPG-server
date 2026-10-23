import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";

/**
 * Cột `player_states` do global room làm chủ (`PlayerData`): túi đồ, trang bị, điểm và thuộc tính đã cộng.
 * Ít đổi, global lưu liền; world chỉ giữ bản sao chỉ-đọc.
 */
export type PlayerGlobalFields = Pick<
    PlayerState,
    | "attributePoints"
    | "skillPoints"
    | "allocatedAttributes"
    | "equipments"
    | "equipmentInventory"
    | "consumableInventory"
    | "materialInventory"
>;

/**
 * Cột `player_states` do world room làm chủ: vị trí, HP/MP, dungeon, level/exp, ví, quest và cờ cốt truyện.
 * Đổi liên tục; world gửi snapshot cho global lưu (backup) theo checkpoint.
 */
export type PlayerWorldFields = Pick<
    PlayerState,
    | "mapCode"
    | "x"
    | "y"
    | "direction"
    | "hp"
    | "mp"
    | "dungeonSession"
    | "level"
    | "exp"
    | "wallet"
    | "flags"
    | "quests"
    | "dailyQuests"
    | "lastTownMapCode"
>;

/** Toàn bộ phần state ghi được xuống DB (`player_states` trừ khoá, class, hitbox, skills). */
export type PlayerSavedState = PlayerGlobalFields & PlayerWorldFields;
