import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentStatService } from "@/modules/equipment/services/equipment-stat.service.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type {
    Equipments,
    EquippedItem,
    InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";
import {
    inventoryService,
    type GrantOutcome,
} from "@/modules/player/services/inventory.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type {
    EquipmentInstanceMessage,
    EquipmentsMessage,
    EquippedItemMessage,
} from "@/rooms/global/modules/player-data/interfaces/player-data.global.message.js";
import type {
    InventoryEntryMessage,
    InventoryFullMessage,
    InventoryMessage,
    InventoryNearlyFullMessage,
} from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";

/**
 * Thao tác túi đồ / trang bị trên `PlayerDataState` và dựng message cho client. Chỉ đổi dữ liệu trong bản ghi
 * (lưu DB, đẩy sang world và gửi message là việc của `PlayerDataGlobalService`).
 */
export class InventoryGlobalService {
    private get playerConfig() {
        return masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);
    }

    inventorySize(type: ItemType): number {
        return inventoryService.inventorySize(type);
    }

    /** Gửi `inventory` (túi + sức chứa + đồ đang mặc) cho client. */
    send(client: PlayerClient, player: PlayerDataState) {
        const message: InventoryMessage = {
            inventories: {
                equipment: player.inventories[ItemType.EQUIPMENT].map((entry) =>
                    this.toEntryMessage(entry)
                ),
                consumable: player.inventories[ItemType.CONSUMABLE].map((entry) =>
                    this.toEntryMessage(entry)
                ),
                material: player.inventories[ItemType.MATERIAL].map((entry) =>
                    this.toEntryMessage(entry)
                ),
            },
            sizes: {
                equipment: this.inventorySize(ItemType.EQUIPMENT),
                consumable: this.inventorySize(ItemType.CONSUMABLE),
                material: this.inventorySize(ItemType.MATERIAL),
            },
            equipments: this.toEquipmentsMessage(player.equipments),
            usableClassCodes: classService.getUsableItemClassCodes(player.classCode),
        };
        client.sendSuccess(GlobalMessage.INVENTORY, message);
    }

    /** Báo client túi sắp đầy / đã đầy sau khi cộng item (gửi sau khi đã lưu). */
    notifyGrant(client: PlayerClient, player: PlayerDataState, outcome: GrantOutcome) {
        for (const type of outcome.touched) {
            const lostItems = outcome.lostByType.get(type);
            if (lostItems) {
                const message: InventoryFullMessage = {
                    type,
                    lostItems: lostItems.map((lost) => this.toItemRewardMessage(lost)),
                };
                client.sendSuccess(GlobalMessage.INVENTORY_FULL, message);
                continue;
            }
            const freeSlots = inventoryService.freeSlotCount(
                player.inventories[type],
                this.inventorySize(type)
            );
            if (freeSlots <= this.playerConfig.inventoryNearlyFullThreshold) {
                const message: InventoryNearlyFullMessage = { type, freeSlots };
                client.sendSuccess(GlobalMessage.INVENTORY_NEARLY_FULL, message);
            }
        }
    }

    private toItemRewardMessage(reward: ItemReward) {
        const item = itemService.getById(reward.itemId);
        return {
            ...reward,
            code: item?.code,
            rarity: reward.metadata?.rarity ?? item?.rarity,
        };
    }

    /** Metadata trang bị → message, kèm main stats đã nhân hệ số cường hoá/tinh hoá. */
    private toInstanceMessage(metadata: ItemEquipmentInstanceMetadata): EquipmentInstanceMessage {
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
                value: bigToNumber(big(line.value).times(multiplier)),
            })),
        };
    }

    /** Lượng hồi của bình (`metadata.heal` / `metadata.mana`) — chỉ gồm vế nào > 0. */
    private potionAmounts(metadata: unknown): { heal?: number; mana?: number } {
        const { heal, mana } = (metadata ?? {}) as { heal?: unknown; mana?: unknown };
        return {
            ...(typeof heal === "number" && heal > 0 ? { heal } : {}),
            ...(typeof mana === "number" && mana > 0 ? { mana } : {}),
        };
    }

    /** Ô túi → message; metadata chỉ gửi với trang bị (item khác để trống). */
    private toEntryMessage(entry: InventoryItem): InventoryEntryMessage {
        const item = itemService.getById(entry.itemId);
        const isEquipment = item?.type === ItemType.EQUIPMENT;
        return {
            id: entry.id,
            itemId: entry.itemId,
            code: item?.code ?? "",
            type: item?.type ?? ItemType.MATERIAL,
            rarity: item?.rarity ?? ItemRarity.COMMON,
            slotIndex: entry.slotIndex,
            quantity: entry.quantity,
            source: entry.source,
            isLocked: entry.isLocked,
            ...(isEquipment
                ? {
                      metadata: this.toInstanceMessage(
                          entry.metadata as ItemEquipmentInstanceMetadata
                      ),
                  }
                : {}),
            ...this.potionAmounts(item?.metadata),
        };
    }

    private toEquippedMessage(entry: EquippedItem): EquippedItemMessage {
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

export const inventoryGlobalService = new InventoryGlobalService();
