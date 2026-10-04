import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import {
    ATTRIBUTE_KEYS,
    createAttributes,
    type Attributes,
    type StatBonus,
    type Stats,
} from "@/modules/player/schemas/stat.schema.js";

/** Điểm attribute nhận thêm mỗi lần lên level (vào `attributePoints` để player tự cộng). */
export const ATTRIBUTE_POINTS_PER_LEVEL = 5;

/**
 * Chỉ số dẫn xuất từ 1 điểm attribute. CHANCE/DAMAGE là tỉ lệ 0 → 1 như StatType.PERCENT:
 * 1 LUCK = +0.1% tỉ lệ chí mạng (0.001) và +1% sát thương chí mạng (0.01).
 */
export const ATTRIBUTE_SCALING: Partial<Record<StatKey, Partial<Record<StatKey, number>>>> = {
    [StatKey.VITALITY]: { [StatKey.MAX_HP]: 10 },
    [StatKey.STRENGTH]: { [StatKey.PHYSICAL_ATTACK]: 1 },
    [StatKey.INTELLIGENCE]: { [StatKey.MAGIC_ATTACK]: 1, [StatKey.MAX_MP]: 10 },
    [StatKey.DEXTERITY]: { [StatKey.EVASION]: 1, [StatKey.ACCURACY]: 1 },
    [StatKey.LUCK]: { [StatKey.CRITICAL_CHANCE]: 0.001, [StatKey.CRITICAL_DAMAGE]: 0.01 },
};

/** Chỉ số nền trước attribute/trang bị. */
export const BASE_STATS: Stats = {
    [StatKey.MOVE_SPEED]: 4,
    [StatKey.CRITICAL_DAMAGE]: 1.5,
};

export interface PlayerStatSources {
    /** `classes.baseAttributes` (điểm level 1). */
    classAttributes: Attributes;
    /** `player_states.allocatedAttributes`. */
    allocatedAttributes: Attributes;
    /** Bonus của class + mọi trang bị đang mặc (stats gốc + rarityStats). */
    bonuses: StatBonus[];
}

/**
 * Attribute cuối = class + đã cộng, rồi áp bonus nhắm vào attribute (FLAT cộng trước, PERCENT nhân sau).
 */
export function computeAttributes(sources: PlayerStatSources): Attributes {
    const attributes = createAttributes();
    for (const key of ATTRIBUTE_KEYS) {
        attributes[key] = sources.classAttributes[key] + sources.allocatedAttributes[key];
    }
    const applied = applyBonuses(attributes, sources.bonuses, ATTRIBUTE_KEYS);
    for (const key of ATTRIBUTE_KEYS) attributes[key] = Math.floor(applied[key] ?? 0);
    return attributes;
}

/** Stat cuối = nền + quy đổi từ attribute, rồi áp bonus nhắm vào stat (FLAT trước, PERCENT sau). */
export function computeStats(sources: PlayerStatSources): { attributes: Attributes; stats: Stats } {
    const attributes = computeAttributes(sources);
    const stats: Stats = { ...BASE_STATS };
    for (const key of ATTRIBUTE_KEYS) {
        for (const [stat, perPoint] of Object.entries(ATTRIBUTE_SCALING[key] ?? {})) {
            const statKey = stat as StatKey;
            stats[statKey] = (stats[statKey] ?? 0) + attributes[key] * perPoint;
        }
    }
    const derivedKeys = Object.values(StatKey).filter(
        (key) => !(ATTRIBUTE_KEYS as readonly StatKey[]).includes(key)
    );
    return { attributes, stats: applyBonuses(stats, sources.bonuses, derivedKeys) };
}

function applyBonuses<T extends Stats>(
    values: T,
    bonuses: StatBonus[],
    keys: readonly StatKey[]
): T {
    const result = { ...values };
    const percent: Stats = {};
    for (const bonus of bonuses) {
        if (!keys.includes(bonus.stat)) continue;
        if (bonus.type === StatType.FLAT) {
            result[bonus.stat] = (result[bonus.stat] ?? 0) + bonus.value;
        } else {
            percent[bonus.stat] = (percent[bonus.stat] ?? 0) + bonus.value;
        }
    }
    for (const [stat, value] of Object.entries(percent)) {
        const statKey = stat as StatKey;
        result[statKey] = (result[statKey] ?? 0) * (1 + (value ?? 0));
    }
    return result;
}
