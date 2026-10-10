/** Loại monster — BOSS nhận DAMAGE_TO_BOSSES, các loại khác nhận DAMAGE_TO_MONSTERS. */
export enum MonsterType {
    NORMAL = "normal",
    ELITE = "elite",
    BOSS = "boss",
}

/** `type` của spawn trong map: một loại cố định, hoặc `random` = mỗi lần sinh / hồi sinh roll normal hoặc elite. */
export const RANDOM_MONSTER_TYPE = "random";
export type MonsterSpawnType = MonsterType | typeof RANDOM_MONSTER_TYPE;
