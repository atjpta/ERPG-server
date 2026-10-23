import { PlayerDataGroup, PlayerStateEvent } from "@/modules/player/enums/player-state.enum.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";

export const PLAYER_GROUP_COLUMNS: Record<PlayerDataGroup, readonly (keyof PlayerSavedState)[]> = {
    [PlayerDataGroup.WALLET]: ["wallet"],
    [PlayerDataGroup.BAG]: [
        "equipmentInventory",
        "consumableInventory",
        "materialInventory",
        "equipments",
        "attributePoints",
        "skillPoints",
        "allocatedAttributes",
    ],
    [PlayerDataGroup.PROGRESS]: [
        "level",
        "exp",
        "quests",
        "dailyQuests",
        "flags",
        "lastTownMapCode",
    ],
    [PlayerDataGroup.PLACE]: ["mapCode", "x", "y", "direction", "hp", "mp", "dungeonSession"],
};

export const ALL_PLAYER_GROUPS = Object.values(PlayerDataGroup);

export const GROUP_EVENT: Partial<Record<PlayerDataGroup, PlayerStateEvent>> = {
    [PlayerDataGroup.WALLET]: PlayerStateEvent.WALLET_CHANGED,
    [PlayerDataGroup.BAG]: PlayerStateEvent.BAG_CHANGED,
};
