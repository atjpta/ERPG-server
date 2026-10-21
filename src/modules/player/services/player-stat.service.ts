import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import type { PlayerStats } from "@/modules/player/types/player-stat.type.js";
import { big, Big, bigToNumber, floorBig } from "@/core/utils/big-number.util.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import {
    type SetPiece,
    equipmentStatService,
} from "@/modules/equipment/services/equipment-stat.service.js";
import { EQUIPMENT_GROUP_BY_TYPE } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { EquipmentMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";
import {
    ATTRIBUTE_KEYS,
    createAttributes,
    type Attributes,
    type StatBonus,
    type Stats,
} from "@/modules/player/schemas/stat.schema.js";

/**
 * Chỉ số dẫn xuất từ 1 điểm attribute. CHANCE/DAMAGE là tỉ lệ 0 → 1 như StatType.PERCENT:
 * 1 LUCK = +0.1% tỉ lệ chí mạng (0.001) và +1% sát thương chí mạng (0.01).
 */
export const ATTRIBUTE_SCALING: Partial<Record<StatKey, Partial<Record<StatKey, number>>>> = {
    [StatKey.VITALITY]: { [StatKey.MAX_HP]: 10, [StatKey.HP_REGEN]: 0.2 },
    [StatKey.STRENGTH]: { [StatKey.PHYSICAL_ATTACK]: 1 },
    [StatKey.INTELLIGENCE]: {
        [StatKey.MAGIC_ATTACK]: 1,
        [StatKey.MAX_MP]: 10,
        [StatKey.MP_REGEN]: 0.2,
    },
    [StatKey.DEXTERITY]: { [StatKey.EVASION]: 1, [StatKey.ACCURACY]: 1 },
    [StatKey.LUCK]: { [StatKey.CRITICAL_CHANCE]: 0.001, [StatKey.CRITICAL_DAMAGE]: 0.01 },
};

/** Chỉ số nền chung mọi class (cộng thêm `classes.baseStats`) trước attribute/trang bị. */
export const BASE_STATS: Stats = {
    [StatKey.CRITICAL_DAMAGE]: 1.5,
};

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

/**
 * Attribute/stat của player tính khi lấy ra (không lưu DB): class + điểm đã cộng + mọi trang bị
 * đang mặc (main × hệ số cường hoá/tinh hoá + sub + rarity) + set đang kích hoạt.
 */
export class PlayerStatService {
    compute(
        state: Pick<PlayerState, "classId" | "allocatedAttributes" | "equipments">
    ): PlayerStats {
        const characterClass = classService.getByIdOrFail(state.classId);
        const bonuses: StatBonus[] = [...characterClass.statBonuses];
        const growth = {
            enhance: masterDataCacheService.get(MasterDataKey.EQUIPMENT_ENHANCE_CONFIG)
                .mainStatGrowth,
            refine: masterDataCacheService.get(MasterDataKey.EQUIPMENT_REFINE_CONFIG)
                .mainStatGrowth,
        };
        const pieces: SetPiece[] = [];
        for (const equipped of Object.values(state.equipments)) {
            if (!equipped) continue;
            const item = itemService.getById(equipped.itemId);
            if (item?.type !== ItemType.EQUIPMENT) continue;
            const template = item.metadata as EquipmentMetadata;
            bonuses.push(...equipmentStatService.equipmentBonuses(equipped.metadata, growth));
            pieces.push({
                biome: template.biome,
                classCode: template.classCode,
                group: EQUIPMENT_GROUP_BY_TYPE[template.equipmentType],
                level: equipped.metadata.level,
            });
        }
        bonuses.push(
            ...equipmentStatService.setBonuses(pieces, (...key) =>
                equipmentConfigService.findSetEntry(...key)
            )
        );
        return this.computeStats({
            classAttributes: characterClass.baseAttributes,
            classBaseStats: characterClass.baseStats,
            allocatedAttributes: state.allocatedAttributes,
            bonuses,
        });
    }

    /**
     * Attribute cuối = class + đã cộng, rồi áp bonus nhắm vào attribute (FLAT cộng trước, PERCENT nhân sau).
     */
    computeAttributes(sources: PlayerStatSources): Attributes {
        const attributes = createAttributes();
        for (const key of ATTRIBUTE_KEYS) {
            attributes[key] = sources.classAttributes[key] + sources.allocatedAttributes[key];
        }
        const applied = this.applyBonuses(attributes, sources.bonuses, ATTRIBUTE_KEYS);
        for (const key of ATTRIBUTE_KEYS) attributes[key] = floorBig(big(applied[key] ?? 0));
        return attributes;
    }

    /** Stat cuối = nền + nền class + quy đổi từ attribute, rồi áp bonus nhắm vào stat (FLAT trước, PERCENT sau). */
    computeStats(sources: PlayerStatSources): { attributes: Attributes; stats: Stats } {
        const attributes = this.computeAttributes(sources);
        const totals = new Map<StatKey, Big>();
        const add = (stat: StatKey, value: Big) =>
            totals.set(stat, (totals.get(stat) ?? big(0)).plus(value));
        for (const base of [BASE_STATS, sources.classBaseStats]) {
            for (const [stat, value] of Object.entries(base)) add(stat as StatKey, big(value ?? 0));
        }
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
        return { attributes, stats: this.applyBonuses(stats, sources.bonuses, derivedKeys) };
    }

    private applyBonuses<T extends Stats>(
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

    /** Giá trị nguyên (HP/MP…) — thiếu stat = 0. */
    static whole(stats: Stats, key: StatKey): number {
        return floorBig(big(stats[key] ?? 0));
    }
}

export const playerStatService = new PlayerStatService();
