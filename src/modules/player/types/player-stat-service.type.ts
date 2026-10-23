import {
    type Attributes,
    type StatBonus,
    type Stats,
} from "@/modules/player/schemas/stat.schema.js";

export interface PlayerStatSources {
    /** `classes.baseAttributes` (điểm level 1). */
    classAttributes: Attributes;
    /** `classes.baseStats` — chỉ số nền cố định của class (move_speed, regen...). */
    classBaseStats: Stats;
    /** `player_states.allocatedAttributes`. */
    allocatedAttributes: Attributes;
    /** Bonus của class + trang bị đang mặc (main/sub/rarity) + set đang kích hoạt. */
    bonuses: StatBonus[];
}
