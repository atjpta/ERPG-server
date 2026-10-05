import { big, floorBig } from "@/core/utils/big-number.util.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import {
    equipmentBonuses,
    setBonuses,
    type SetPiece,
} from "@/modules/equipment/utils/equipment-stat.util.js";
import { EQUIPMENT_GROUP_BY_TYPE } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import type { EquipmentMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Attributes, StatBonus, Stats } from "@/modules/player/schemas/stat.schema.js";
import { computeStats } from "@/modules/player/utils/player-stat.util.js";

export interface PlayerStats {
    attributes: Attributes;
    stats: Stats;
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
            enhance: equipmentConfigService.enhance.mainStatGrowth,
            refine: equipmentConfigService.refine.mainStatGrowth,
        };
        const pieces: SetPiece[] = [];
        for (const equipped of Object.values(state.equipments)) {
            if (!equipped) continue;
            const item = itemService.getById(equipped.itemId);
            if (item?.type !== ItemType.EQUIPMENT) continue;
            const template = item.metadata as EquipmentMetadata;
            bonuses.push(...equipmentBonuses(equipped.metadata, growth));
            pieces.push({
                biome: template.biome,
                classCode: template.classCode,
                group: EQUIPMENT_GROUP_BY_TYPE[template.equipmentType],
                level: equipped.metadata.level,
            });
        }
        bonuses.push(
            ...setBonuses(pieces, (...key) => equipmentConfigService.findSetEntry(...key))
        );
        return computeStats({
            classAttributes: characterClass.baseAttributes,
            classBaseStats: characterClass.baseStats,
            allocatedAttributes: state.allocatedAttributes,
            bonuses,
        });
    }

    /** Giá trị nguyên (HP/MP…) — thiếu stat = 0. */
    static whole(stats: Stats, key: StatKey): number {
        return floorBig(big(stats[key] ?? 0));
    }
}

export const playerStatService = new PlayerStatService();
