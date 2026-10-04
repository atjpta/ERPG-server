import { big, Big, bigToNumber, floorBig } from "@/core/utils/big-number.util.js";
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
    for (const key of ATTRIBUTE_KEYS) attributes[key] = floorBig(big(applied[key] ?? 0));
    return attributes;
}

/** Stat cuối = nền + quy đổi từ attribute, rồi áp bonus nhắm vào stat (FLAT trước, PERCENT sau). */
export function computeStats(sources: PlayerStatSources): { attributes: Attributes; stats: Stats } {
    const attributes = computeAttributes(sources);
    const totals = new Map<StatKey, Big>();
    const add = (stat: StatKey, value: Big) =>
        totals.set(stat, (totals.get(stat) ?? big(0)).plus(value));
    for (const [stat, value] of Object.entries(BASE_STATS)) add(stat as StatKey, big(value ?? 0));
    for (const key of ATTRIBUTE_KEYS) {
        for (const [stat, perPoint] of Object.entries(ATTRIBUTE_SCALING[key] ?? {})) {
            add(stat as StatKey, big(attributes[key]).times(perPoint ?? 0));
        }
    }
    const stats: Stats = {};
    for (const [stat, value] of totals) stats[stat] = bigToNumber(value);
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
    const flat = new Map<StatKey, Big>();
    const percent = new Map<StatKey, Big>();
    for (const bonus of bonuses) {
        if (!keys.includes(bonus.stat)) continue;
        const target = bonus.type === StatType.FLAT ? flat : percent;
        target.set(bonus.stat, (target.get(bonus.stat) ?? big(0)).plus(bonus.value));
    }
    const result = { ...values };
    for (const key of new Set([...flat.keys(), ...percent.keys()])) {
        const value = big(values[key] ?? 0)
            .plus(flat.get(key) ?? 0)
            .times(big(1).plus(percent.get(key) ?? 0));
        result[key] = bigToNumber(value) as T[StatKey];
    }
    return result;
}
