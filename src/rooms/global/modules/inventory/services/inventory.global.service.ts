import { equipmentMessageService } from "@/modules/equipment/services/equipment-message.service.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import {
    inventoryService,
    type GrantOutcome,
} from "@/modules/player/services/inventory.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type {
    InventoryEntryMessage,
    InventoryFullMessage,
    InventoryMessage,
    InventoryNearlyFullMessage,
} from "@/rooms/global/modules/inventory/interfaces/inventory.global.message.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";

/**
 * Dựng message túi đồ / trang bị cho client từ dữ liệu người chơi (`PlayerRuntime`).
 */
export class InventoryGlobalService {
    private get playerConfig() {
        return masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);
    }

    inventorySize(type: ItemType): number {
        return inventoryService.inventorySize(type);
    }

    /** Gửi `inventory` (túi + sức chứa + đồ đang mặc) cho client. */
    send(client: PlayerClient, player: PlayerRuntime) {
        const inventories = player.inventories;
        const message: InventoryMessage = {
            inventories: {
                equipment: inventories[ItemType.EQUIPMENT].map((entry) =>
                    this.toEntryMessage(entry)
                ),
                consumable: inventories[ItemType.CONSUMABLE].map((entry) =>
                    this.toEntryMessage(entry)
                ),
                material: inventories[ItemType.MATERIAL].map((entry) => this.toEntryMessage(entry)),
            },
            sizes: {
                equipment: this.inventorySize(ItemType.EQUIPMENT),
                consumable: this.inventorySize(ItemType.CONSUMABLE),
                material: this.inventorySize(ItemType.MATERIAL),
            },
            equipments: equipmentMessageService.toEquipmentsMessage(player.data.equipments),
            usableClassCodes: classService.getUsableItemClassCodes(player.classCode),
        };
        client.sendSuccess(GlobalMessage.INVENTORY, message);
    }

    /** Báo client túi sắp đầy / đã đầy sau khi cộng item (gửi sau khi đã lưu). */
    notifyGrant(client: PlayerClient, player: PlayerRuntime, outcome: GrantOutcome) {
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

    toItemRewardMessage(reward: ItemReward) {
        const item = itemService.getById(reward.itemId);
        return {
            ...reward,
            code: item?.code,
            rarity: reward.metadata?.rarity ?? item?.rarity,
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
    toEntryMessage(entry: InventoryItem): InventoryEntryMessage {
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
                      metadata: equipmentMessageService.toInstanceMessage(
                          entry.metadata as ItemEquipmentInstanceMetadata
                      ),
                  }
                : {}),
            ...this.potionAmounts(item?.metadata),
        };
    }
}

export const inventoryGlobalService = new InventoryGlobalService();
