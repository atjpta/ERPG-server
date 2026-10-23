import { CalcService } from "@/core/calc/calc.service.js";
import type {
    EquipmentInstanceMessage,
    EquipmentsMessage,
    EquippedItemMessage,
} from "@/modules/equipment/interfaces/equipment.message.js";
import { equipmentStatService } from "@/modules/equipment/services/equipment-stat.service.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { Equipments, EquippedItem } from "@/modules/player/schemas/inventory.schema.js";

/** Dựng message trang bị gửi client (chỉ số đã nhân hệ số cường hoá / tinh hoá, code / rarity của item). */
export class EquipmentMessageService {
    /** Metadata trang bị → message, kèm main stats đã nhân hệ số cường hoá/tinh hoá. */
    toInstanceMessage(metadata: ItemEquipmentInstanceMetadata): EquipmentInstanceMessage {
        const calc = new CalcService("big");
        const multiplier = equipmentStatService.mainStatMultiplier(metadata, {
            enhance: masterDataCacheService.get(MasterDataKey.EQUIPMENT_ENHANCE_CONFIG)
                .mainStatGrowth,
            refine: masterDataCacheService.get(MasterDataKey.EQUIPMENT_REFINE_CONFIG)
                .mainStatGrowth,
        });
        return {
            ...metadata,
            finalMainStats: metadata.mainStats.map((line) => ({
                ...line,
                value: calc.of(line.value).times(multiplier).toNumber(),
            })),
        };
    }

    toEquippedMessage(entry: EquippedItem): EquippedItemMessage {
        const item = itemService.getById(entry.itemId);
        return {
            ...entry,
            code: item?.code ?? "",
            type: item?.type ?? ItemType.EQUIPMENT,
            rarity: item?.rarity ?? ItemRarity.COMMON,
            metadata: this.toInstanceMessage(entry.metadata),
        };
    }

    /** Đồ đang mặc kèm code/rarity; slot trống giữ `null`. */
    toEquipmentsMessage(equipments: Equipments): EquipmentsMessage {
        return Object.fromEntries(
            Object.entries(equipments).map(([slot, entry]) => [
                slot,
                entry ? this.toEquippedMessage(entry) : null,
            ])
        ) as EquipmentsMessage;
    }
}

export const equipmentMessageService = new EquipmentMessageService();
