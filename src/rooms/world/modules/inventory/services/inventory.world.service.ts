import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentStatService } from "@/modules/equipment/services/equipment-stat.service.js";
import { ItemRarity, ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type {
    Equipments,
    EquippedItem,
    InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { worldEvents } from "@/rooms/world/utils/world-events.js";
import {
    WorldMessage,
    type EquipmentInstanceMessage,
    type EquipmentsMessage,
    type EquippedItemMessage,
    type InventoryEntryMessage,
    type InventoryFullMessage,
    type InventoryMessage,
    type InventoryNearlyFullMessage,
} from "@/rooms/world/types/world-message.type.js";

/** Hồi chiêu của bình HP và của bình MP (tính riêng từng loại). */
export const POTION_COOLDOWN_MS = 10_000;

/**
 * Thao tác túi đồ / trang bị của player đang online. Chỉ đổi state trong room (lưu DB ở checkpoint,
 * riêng cường hoá / tinh hoá / phân rã thì command lưu ngay).
 */
export class InventoryWorldService {
    private get playerConfig() {
        return masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);
    }

    inventorySize(type: ItemType): number {
        return this.playerConfig.inventorySize[type];
    }

    send(client: PlayerClient, player: PlayerWorldState) {
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
            wallet: player.wallet,
        };
        client.sendSuccess(WorldMessage.INVENTORY, message);
        worldEvents.emitInventoryChanged(client, player);
    }

    /** Số item (theo code) player đang có — 0 nếu code không có trong catalog. */
    countByCode(player: PlayerWorldState, itemCode: string): number {
        const item = itemService.getByCode(itemCode);
        return item ? inventoryService.countItem(player.inventories[item.type], item.id) : 0;
    }

    /** Trừ item theo code; `false` (không đổi gì) nếu không đủ. */
    takeByCode(player: PlayerWorldState, itemCode: string, quantity: number): boolean {
        const item = itemService.getByCode(itemCode);
        return (
            !!item &&
            inventoryService.removeFromInventory(player.inventories[item.type], item.id, quantity)
        );
    }

    /** Túi có đủ chỗ nhận hết `items` không (tính thử trên bản sao — không đổi túi thật). */
    canFit(player: PlayerWorldState, items: readonly ItemReward[]): boolean {
        const trial = new Map<ItemType, InventoryItem[]>();
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            const bag = trial.get(item.type) ?? structuredClone(player.inventories[item.type]);
            trial.set(item.type, bag);
            const { overflow } = inventoryService.addToInventory(
                bag,
                this.inventorySize(item.type),
                item,
                reward.quantity,
                { source: ItemSource.QUEST, metadata: reward.metadata }
            );
            if (overflow > 0) return false;
        }
        return true;
    }

    // ---- Nhận item ------------------------------------------------------------------------------

    /**
     * Cộng item (thưởng, rơi đồ...) vào đúng túi theo ItemType; báo túi sắp đầy / đã đầy (item không
     * còn chỗ bị mất).
     */
    grantItems(
        client: PlayerClient | undefined,
        player: PlayerWorldState,
        items: ItemReward[],
        source: ItemSource = ItemSource.DROP
    ) {
        const lostByType = new Map<ItemType, ItemReward[]>();
        const touched = new Set<ItemType>();
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            touched.add(item.type);
            const { overflow } = inventoryService.addToInventory(
                player.inventories[item.type],
                this.inventorySize(item.type),
                item,
                reward.quantity,
                { source, metadata: reward.metadata }
            );
            if (overflow > 0) {
                const lost = lostByType.get(item.type) ?? [];
                lost.push({ ...reward, quantity: overflow });
                lostByType.set(item.type, lost);
            }
        }
        if (!client || touched.size === 0) return;
        for (const type of touched) {
            const lostItems = lostByType.get(type);
            if (lostItems) {
                const message: InventoryFullMessage = { type, lostItems };
                client.sendSuccess(WorldMessage.INVENTORY_FULL, message);
                continue;
            }
            const freeSlots = inventoryService.freeSlotCount(
                player.inventories[type],
                this.inventorySize(type)
            );
            if (freeSlots <= this.playerConfig.inventoryNearlyFullThreshold) {
                const message: InventoryNearlyFullMessage = { type, freeSlots };
                client.sendSuccess(WorldMessage.INVENTORY_NEARLY_FULL, message);
            }
        }
        this.send(client, player);
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

    /** Ô túi → message; metadata chỉ gửi với trang bị (item khác để trống). */
    /** Lượng hồi của bình (`metadata.heal` / `metadata.mana`) — chỉ gồm vế nào > 0. */
    private potionAmounts(metadata: unknown): { heal?: number; mana?: number } {
        const { heal, mana } = (metadata ?? {}) as { heal?: unknown; mana?: unknown };
        return {
            ...(typeof heal === "number" && heal > 0 ? { heal } : {}),
            ...(typeof mana === "number" && mana > 0 ? { mana } : {}),
        };
    }

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

export const inventoryWorldService = new InventoryWorldService();
