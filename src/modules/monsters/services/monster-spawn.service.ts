import { pickWeighted, type Rng } from "@/modules/equipment/services/equipment-roll.service.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { MonsterSpawn } from "@/modules/maps/entities/game-map.entity.js";
import { MonsterType, RANDOM_MONSTER_TYPE } from "@/modules/monsters/enums/monster-type.enum.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { MonsterSpawnConfig } from "@/modules/monsters/schemas/monster-spawn-config.schema.js";
import type { MonsterVariant } from "@/modules/monsters/services/monster-stat.service.js";
import { randomInt } from "@/modules/rewards/services/reward-roll.service.js";

/**
 * Loại + độ hiếm của 1 con monster khi sinh / hồi sinh. Spawn `random` ra elite với `eliteChance`, trừ khi
 * map đã có đủ `maxElitesPerMap` elite đang sống (`eliteAlive`) → normal. Độ hiếm cố định theo spawn,
 * không thì roll theo trọng số của loại trong `monster_spawn_config`.
 */
export function rollMonsterVariant(
    spawn: Pick<MonsterSpawn, "type" | "rarity">,
    config: MonsterSpawnConfig,
    eliteAlive: number,
    rng: Rng = Math.random
): MonsterVariant {
    let type: MonsterType;
    if (spawn.type === RANDOM_MONSTER_TYPE) {
        const canBeElite = eliteAlive < config.maxElitesPerMap;
        type = canBeElite && rng() < config.eliteChance ? MonsterType.ELITE : MonsterType.NORMAL;
    } else {
        type = spawn.type ?? MonsterType.NORMAL;
    }
    const weights = Object.entries(config.rarityWeights[type] ?? {}) as [ItemRarity, number][];
    const rarity =
        spawn.rarity ??
        pickWeighted(weights, ([, weight]) => weight, rng)?.[0] ??
        ItemRarity.COMMON;
    return { type, rarity };
}

/** Level của quái sinh ra: random trong [minLevel, maxLevel] của spawn; không có khoảng → level của monster. */
export function rollMonsterLevel(
    baseLevel: number,
    spawn: Pick<MonsterSpawn, "minLevel" | "maxLevel">,
    rng: Rng = Math.random
): number {
    const { minLevel, maxLevel } = spawn;
    if (minLevel === undefined && maxLevel === undefined) return baseLevel;
    const min = minLevel ?? maxLevel!;
    return randomInt(min, Math.max(min, maxLevel ?? min), rng);
}

/** exp theo level — cùng công thức MonsterSeed: 20 × lv × (1 + lv/10). */
export const monsterExpAtLevel = (level: number) => 20 * level * (1 + level / 10);

/**
 * Thưởng đã seed ứng với level gốc của monster; quái sinh ở level khác thì exp (theo `monsterExpAtLevel`)
 * và tiền (tỉ lệ thuận level) đổi theo tỉ lệ.
 */
export function scaleDropsToLevel(
    drops: MonsterDrops,
    baseLevel: number,
    level: number
): MonsterDrops {
    if (level === baseLevel || baseLevel <= 0) return drops;
    const goldRatio = level / baseLevel;
    return {
        ...drops,
        exp: Math.floor(drops.exp * (monsterExpAtLevel(level) / monsterExpAtLevel(baseLevel))),
        currency: drops.currency.map((drop) => ({
            ...drop,
            min: Math.max(0, Math.round(drop.min * goldRatio)),
            max: Math.max(0, Math.round(drop.max * goldRatio)),
        })),
    };
}
