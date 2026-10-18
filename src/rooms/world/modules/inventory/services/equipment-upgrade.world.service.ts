import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { big } from "@/core/utils/big-number.util.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import type { Rng } from "@/modules/equipment/services/equipment-roll.service.js";
import {
    disassembleYield,
    type MaterialCost,
    type UpgradeCost,
} from "@/modules/equipment/services/equipment-upgrade.service.js";
import { type ItemEquipmentSlotType } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import {
    addToInventory,
    countItem,
    removeFromInventory,
} from "@/modules/player/services/inventory.service.js";
import { debitWallet } from "@/modules/player/services/player-progress.service.js";
import type {
    InventoryResult,
    OwnedEquipment,
} from "@/rooms/world/modules/inventory/types/inventory.world.type.js";
import { toOwnedEquipment } from "@/rooms/world/modules/inventory/utils/equipment-instance.world.util.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { type MaterialAmountMessage } from "@/rooms/world/types/world-message.type.js";

export class EquipmentUpgradeWorldService {
    private inventorySize(type: ItemType): number {
        return masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG).inventorySize[type];
    }

    /** Tính phân rã trên bản sao túi nguyên liệu — dùng chung cho phân rã thật và xem trước. */
    simulateDisassemble(
        player: PlayerWorldState,
        instanceIds: string[]
    ): InventoryResult<{
        ids: string[];
        materials: InventoryItem[];
        received: MaterialAmountMessage[];
    }> {
        const ids = [...new Set(instanceIds)];
        const bag = player.inventories[ItemType.EQUIPMENT];
        const yields: MaterialCost[] = [];
        for (const id of ids) {
            const entry = bag.find((candidate) => candidate.id === id);
            if (!entry) return fail(ItemErrorCode.ITEM_NOT_FOUND);
            if (entry.isLocked) return fail(ItemErrorCode.ITEM_LOCKED);
            const owned = toOwnedEquipment(entry);
            if (!owned) return fail(ItemErrorCode.ITEM_NOT_EQUIPMENT);
            yields.push(
                ...disassembleYield(owned.metadata, owned.group, equipmentConfigService.disassemble)
            );
        }

        const materials = structuredClone(player.inventories[ItemType.MATERIAL]);
        const received = new Map<string, { itemId: string; code: string; quantity: number }>();
        for (const { code, quantity } of yields) {
            const item = itemService.getByCode(code);
            if (!item) return fail(ItemErrorCode.ITEM_NOT_ENOUGH, undefined, { code });
            const { overflow } = addToInventory(
                materials,
                this.inventorySize(ItemType.MATERIAL),
                item,
                quantity,
                { source: ItemSource.CRAFT }
            );
            if (overflow > 0) return fail(ItemErrorCode.INVENTORY_FULL);
            const current = received.get(code) ?? { itemId: item.id, code, quantity: 0 };
            current.quantity += quantity;
            received.set(code, current);
        }
        return ok({ ids, materials, received: [...received.values()] });
    }

    // ---- Nội bộ ---------------------------------------------------------------------------------

    rollSuccess(rate: number, rng: Rng) {
        return big(rng()).lt(rate);
    }

    /** Trừ vàng + nguyên liệu (kiểm tra đủ hết rồi mới trừ). */
    pay(player: PlayerWorldState, cost: UpgradeCost): InventoryResult {
        const wallet = debitWallet(player.wallet, [{ code: CurrencyCode.GOLD, amount: cost.gold }]);
        if (!wallet) return fail(ItemErrorCode.CURRENCY_NOT_ENOUGH);
        const materials = player.inventories[ItemType.MATERIAL];
        const resolved: { itemId: string; quantity: number }[] = [];
        for (const { code, quantity } of cost.materials) {
            const item = itemService.getByCode(code);
            if (!item) return fail(ItemErrorCode.ITEM_NOT_ENOUGH, undefined, { code });
            if (countItem(materials, item.id) < quantity)
                return fail(ItemErrorCode.ITEM_NOT_ENOUGH);
            resolved.push({ itemId: item.id, quantity });
        }
        for (const { itemId, quantity } of resolved) {
            removeFromInventory(materials, itemId, quantity);
        }
        player.wallet = wallet;
        return ok(undefined);
    }

    update(
        player: PlayerWorldState,
        owned: OwnedEquipment,
        metadata: ItemEquipmentInstanceMetadata
    ) {
        owned.entry.metadata = metadata;
        if (owned.equippedSlot) player.refreshStats();
    }

    findOwned(player: PlayerWorldState, instanceId: string): OwnedEquipment | undefined {
        const inBag = player.inventories[ItemType.EQUIPMENT].find(
            (candidate) => candidate.id === instanceId
        );
        if (inBag) return toOwnedEquipment(inBag);
        for (const [slot, equipped] of Object.entries(player.equipments)) {
            if (equipped?.id === instanceId) {
                return toOwnedEquipment(equipped, slot as ItemEquipmentSlotType);
            }
        }
        return undefined;
    }
}
export const equipmentUpgradeWorldService = new EquipmentUpgradeWorldService();
