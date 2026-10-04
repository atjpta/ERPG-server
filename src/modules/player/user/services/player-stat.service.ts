import { classService } from "@/modules/classes/services/class.service.js";
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
 * đang mặc (stats gốc của item + rarityStats của món đó). Dùng cache class/item.
 */
export class PlayerStatService {
    compute(
        state: Pick<PlayerState, "classId" | "allocatedAttributes" | "equipments">
    ): PlayerStats {
        const characterClass = classService.getByIdOrFail(state.classId);
        const bonuses: StatBonus[] = [...characterClass.statBonuses];
        for (const equipped of Object.values(state.equipments)) {
            if (!equipped) continue;
            const item = itemService.getById(equipped.itemId);
            if (item?.type !== ItemType.EQUIPMENT) continue;
            bonuses.push(...(item.metadata as EquipmentMetadata).stats);
            bonuses.push(...(equipped.metadata.rarityStats ?? []));
        }
        return computeStats({
            classAttributes: characterClass.baseAttributes,
            allocatedAttributes: state.allocatedAttributes,
            bonuses,
        });
    }

    /** Giá trị nguyên (HP/MP…) — thiếu stat = 0. */
    static whole(stats: Stats, key: StatKey): number {
        return Math.floor(stats[key] ?? 0);
    }
}

export const playerStatService = new PlayerStatService();
