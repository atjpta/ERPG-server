import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import type { Rng } from "@/modules/equipment/utils/equipment-roll.util.js";
import { mainStatMultiplier } from "@/modules/equipment/utils/equipment-stat.util.js";
import {
    applyEnhance,
    applyRefine,
    disassembleYield,
    enhanceCost,
    refineCost,
    type MaterialCost,
    type UpgradeCost,
} from "@/modules/equipment/utils/equipment-upgrade.util.js";
import type { Item } from "@/modules/items/entities/item.entity.js";
import {
    EQUIPMENT_GROUP_BY_TYPE,
    EQUIPMENT_SLOTS_BY_TYPE,
    type EquipmentGroup,
    type ItemEquipmentSlotType,
} from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentMetadata,
    ItemEquipmentInstanceMetadata,
} from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type {
    EquippedItem,
    Equipments,
    InventoryItem,
} from "@/modules/player/schemas/inventory.schema.js";
import {
    addToInventory,
    countItem,
    freeSlotCount,
    freeSlotIndexes,
    moveInventorySlot,
    removeFromInventory,
    takeInstance,
} from "@/modules/player/utils/inventory.util.js";
import { debitWallet } from "@/modules/player/utils/player-progress.util.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import {
    EquipmentUpgradeAction,
    WorldMessage,
    type DisassemblePreviewMessage,
    type EquipmentInstanceMessage,
    type EquippedItemMessage,
    type EquipmentsMessage,
    type InventoryEntryMessage,
    type EquipmentUpgradeMessage,
    type InventoryFullMessage,
    type InventoryMessage,
    type InventoryNearlyFullMessage,
    type MaterialAmountMessage,
} from "@/rooms/world/world.message.js";

/** Lỗi nghiệp vụ trả về client (chuỗi) hoặc kết quả. */
export type InventoryResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** Metadata trang bị → message, kèm main stats đã nhân hệ số cường hoá/tinh hoá. */
const toInstanceMessage = (metadata: ItemEquipmentInstanceMetadata): EquipmentInstanceMessage => {
    const multiplier = mainStatMultiplier(metadata, {
        enhance: equipmentConfigService.enhance.mainStatGrowth,
        refine: equipmentConfigService.refine.mainStatGrowth,
    });
    return {
        ...metadata,
        finalMainStats: metadata.mainStats.map((line) => ({
            ...line,
            value: bigToNumber(big(line.value).times(multiplier)),
        })),
    };
};

/** Ô túi → message; metadata chỉ gửi với trang bị (item khác để trống). */
const toEntryMessage = (entry: InventoryItem): InventoryEntryMessage => {
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
            ? { metadata: toInstanceMessage(entry.metadata as ItemEquipmentInstanceMetadata) }
            : {}),
    };
};

const toEquippedMessage = (entry: EquippedItem): EquippedItemMessage => {
    const item = itemService.getById(entry.itemId);
    return {
        ...entry,
        code: item?.code ?? "",
        type: item?.type ?? ItemType.EQUIPMENT,
        rarity: item?.rarity ?? ItemRarity.COMMON,
        metadata: toInstanceMessage(entry.metadata),
    };
};

/** Đồ đang mặc kèm code/rarity; slot trống giữ `null`. */
const toEquipmentsMessage = (equipments: Equipments): EquipmentsMessage =>
    Object.fromEntries(
        Object.entries(equipments).map(([slot, entry]) => [
            slot,
            entry ? toEquippedMessage(entry) : null,
        ])
    ) as EquipmentsMessage;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const done = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** Một trang bị của player — đang nằm trong túi hoặc đang mặc. */
interface OwnedEquipment {
    entry: InventoryItem | EquippedItem;
    item: Item;
    template: EquipmentMetadata;
    group: EquipmentGroup;
    metadata: ItemEquipmentInstanceMetadata;
    equippedSlot?: ItemEquipmentSlotType;
}

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

    send(client: PlayerClient, player: PlayerWorldState, error?: string) {
        const message: InventoryMessage = {
            ok: !error,
            ...(error ? { error } : {}),
            inventories: {
                equipment: player.inventories[ItemType.EQUIPMENT].map(toEntryMessage),
                consumable: player.inventories[ItemType.CONSUMABLE].map(toEntryMessage),
                material: player.inventories[ItemType.MATERIAL].map(toEntryMessage),
            },
            sizes: {
                equipment: this.inventorySize(ItemType.EQUIPMENT),
                consumable: this.inventorySize(ItemType.CONSUMABLE),
                material: this.inventorySize(ItemType.MATERIAL),
            },
            equipments: toEquipmentsMessage(player.equipments),
            usableClassCodes: classService.getUsableItemClassCodes(player.classCode),
            wallet: player.wallet,
        };
        client.send(WorldMessage.INVENTORY, message);
    }

    // ---- Nhận item ------------------------------------------------------------------------------

    /**
     * Cộng item (thưởng, rơi đồ...) vào đúng túi theo ItemType; báo túi sắp đầy / đã đầy (item không
     * còn chỗ bị mất).
     */
    grantItems(client: PlayerClient | undefined, player: PlayerWorldState, items: ItemReward[]) {
        const lostByType = new Map<ItemType, ItemReward[]>();
        const touched = new Set<ItemType>();
        for (const reward of items) {
            const item = itemService.getById(reward.itemId);
            if (!item) continue;
            touched.add(item.type);
            const { overflow } = addToInventory(
                player.inventories[item.type],
                this.inventorySize(item.type),
                item,
                reward.quantity,
                { source: ItemSource.DROP, metadata: reward.metadata }
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
                client.send(WorldMessage.INVENTORY_FULL, message);
                continue;
            }
            const freeSlots = freeSlotCount(player.inventories[type], this.inventorySize(type));
            if (freeSlots <= this.playerConfig.inventoryNearlyFullThreshold) {
                const message: InventoryNearlyFullMessage = { type, freeSlots };
                client.send(WorldMessage.INVENTORY_NEARLY_FULL, message);
            }
        }
        this.send(client, player);
    }

    // ---- Mặc / tháo / sắp xếp ---------------------------------------------------------------------

    equip(
        player: PlayerWorldState,
        instanceId: string,
        requestedSlot?: ItemEquipmentSlotType
    ): InventoryResult {
        const bag = player.inventories[ItemType.EQUIPMENT];
        const entry = bag.find((candidate) => candidate.id === instanceId);
        if (!entry) return fail("Item not found");
        const owned = this.toOwned(entry);
        if (!owned) return fail("Item is not equipment");
        if (!classService.canUseClassItem(player.classId, owned.template.classCode)) {
            return fail("Your class cannot use this item");
        }
        if (owned.metadata.level > player.level) return fail("Level is too low");

        const slots = EQUIPMENT_SLOTS_BY_TYPE[owned.template.equipmentType];
        if (requestedSlot && !slots.includes(requestedSlot)) return fail("Invalid slot");
        const slot =
            requestedSlot ?? slots.find((candidate) => !player.equipments[candidate]) ?? slots[0];

        takeInstance(bag, instanceId);
        const previous = player.equipments[slot];
        player.equipments[slot] = {
            id: entry.id,
            itemId: entry.itemId,
            source: entry.source,
            isLocked: entry.isLocked,
            metadata: owned.metadata,
        };
        // Món đang mặc ở slot đó về đúng ô vừa trống.
        if (previous) bag.push(this.toInventoryEntry(previous, entry.slotIndex));
        player.refreshStats();
        return done(undefined);
    }

    unequip(player: PlayerWorldState, slot: ItemEquipmentSlotType): InventoryResult {
        const equipped = player.equipments[slot];
        if (!equipped) return fail("Slot is empty");
        const bag = player.inventories[ItemType.EQUIPMENT];
        const [slotIndex] = freeSlotIndexes(bag, this.inventorySize(ItemType.EQUIPMENT));
        if (slotIndex === undefined) return fail("Equipment inventory is full");
        bag.push(this.toInventoryEntry(equipped, slotIndex));
        player.equipments[slot] = null;
        player.refreshStats();
        return done(undefined);
    }

    move(
        player: PlayerWorldState,
        type: ItemType,
        fromSlot: number,
        toSlot: number
    ): InventoryResult {
        const error = moveInventorySlot(
            player.inventories[type],
            this.inventorySize(type),
            fromSlot,
            toSlot
        );
        return error ? fail(error) : done(undefined);
    }

    lock(player: PlayerWorldState, instanceId: string, locked: boolean): InventoryResult {
        const entry =
            Object.values(player.inventories)
                .flat()
                .find((candidate) => candidate.id === instanceId) ??
            Object.values(player.equipments).find((candidate) => candidate?.id === instanceId);
        if (!entry) return fail("Item not found");
        entry.isLocked = locked;
        return done(undefined);
    }

    // ---- Cường hoá / tinh hoá / phân rã ---------------------------------------------------------

    enhance(
        player: PlayerWorldState,
        instanceId: string,
        rng: Rng = Math.random
    ): InventoryResult<EquipmentUpgradeMessage> {
        const owned = this.findOwned(player, instanceId);
        if (!owned) return fail("Equipment not found");
        const cost = enhanceCost(owned.metadata, owned.group, equipmentConfigService.enhance);
        if ("reason" in cost) return fail(cost.reason);
        const paid = this.pay(player, cost.value);
        if (!paid.ok) return paid;

        const success = this.rollSuccess(cost.value.rate, rng);
        this.update(player, owned, applyEnhance(owned.metadata, cost.value.step, success));
        return done({
            action: EquipmentUpgradeAction.ENHANCE,
            success,
            instanceIds: [instanceId],
            instance: owned.entry.metadata as ItemEquipmentInstanceMetadata,
        });
    }

    refine(
        player: PlayerWorldState,
        instanceId: string,
        rng: Rng = Math.random
    ): InventoryResult<EquipmentUpgradeMessage> {
        const owned = this.findOwned(player, instanceId);
        if (!owned) return fail("Equipment not found");
        const cost = refineCost(owned.metadata, equipmentConfigService.refine);
        if ("reason" in cost) return fail(cost.reason);
        const statEntry = equipmentConfigService.findStatEntry(
            owned.template.classCode,
            owned.template.equipmentType,
            owned.metadata.level
        );
        if (!statEntry) return fail("Equipment config is missing");
        const paid = this.pay(player, cost.value);
        if (!paid.ok) return paid;

        const success = this.rollSuccess(cost.value.rate, rng);
        if (success) {
            this.update(
                player,
                owned,
                applyRefine({
                    instance: owned.metadata,
                    target: cost.value.target,
                    rarityLineCount: equipmentConfigService.stat.rarityLineCount,
                    rarityPool: statEntry.rarityPool,
                    rng,
                })
            );
        }
        return done({
            action: EquipmentUpgradeAction.REFINE,
            success,
            instanceIds: [instanceId],
            instance: owned.entry.metadata as ItemEquipmentInstanceMetadata,
        });
    }

    /** Phân rã các trang bị trong túi (không khoá); nguyên liệu không đủ chỗ thì huỷ cả lượt. */
    disassemble(
        player: PlayerWorldState,
        instanceIds: string[]
    ): InventoryResult<EquipmentUpgradeMessage> {
        const result = this.simulateDisassemble(player, instanceIds);
        if ("error" in result) return result;
        const { ids, materials, received } = result.value;

        const bag = player.inventories[ItemType.EQUIPMENT];
        for (const id of ids) takeInstance(bag, id);
        player.inventories[ItemType.MATERIAL] = materials;
        return done({
            action: EquipmentUpgradeAction.DISASSEMBLE,
            success: true,
            instanceIds: ids,
            materials: received,
        });
    }

    /** Gửi `disassemblePreview`: nguyên liệu sẽ nhận nếu phân rã, không đổi gì trên player. */
    sendDisassemblePreview(
        client: PlayerClient,
        player: PlayerWorldState,
        instanceIds: string[],
        error?: string
    ) {
        const result = error ? fail(error) : this.simulateDisassemble(player, instanceIds);
        const message: DisassemblePreviewMessage =
            "error" in result
                ? { ok: false, error: result.error, instanceIds, materials: [] }
                : { ok: true, instanceIds: result.value.ids, materials: result.value.received };
        client.send(WorldMessage.DISASSEMBLE_PREVIEW, message);
    }

    /** Tính phân rã trên bản sao túi nguyên liệu — dùng chung cho phân rã thật và xem trước. */
    private simulateDisassemble(
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
            if (!entry) return fail("Item not found");
            if (entry.isLocked) return fail("Item is locked");
            const owned = this.toOwned(entry);
            if (!owned) return fail("Item is not equipment");
            yields.push(
                ...disassembleYield(owned.metadata, owned.group, equipmentConfigService.disassemble)
            );
        }

        const materials = structuredClone(player.inventories[ItemType.MATERIAL]);
        const received = new Map<string, { itemId: string; code: string; quantity: number }>();
        for (const { code, quantity } of yields) {
            const item = itemService.getByCode(code);
            if (!item) return fail(`Material "${code}" is missing`);
            const { overflow } = addToInventory(
                materials,
                this.inventorySize(ItemType.MATERIAL),
                item,
                quantity,
                { source: ItemSource.CRAFT }
            );
            if (overflow > 0) return fail("Material inventory is full");
            const current = received.get(code) ?? { itemId: item.id, code, quantity: 0 };
            current.quantity += quantity;
            received.set(code, current);
        }
        return done({ ids, materials, received: [...received.values()] });
    }

    // ---- Nội bộ ---------------------------------------------------------------------------------

    private rollSuccess(rate: number, rng: Rng) {
        return big(rng()).lt(rate);
    }

    /** Trừ vàng + nguyên liệu (kiểm tra đủ hết rồi mới trừ). */
    private pay(player: PlayerWorldState, cost: UpgradeCost): InventoryResult {
        const wallet = debitWallet(player.wallet, [{ code: CurrencyCode.GOLD, amount: cost.gold }]);
        if (!wallet) return fail("Not enough gold");
        const materials = player.inventories[ItemType.MATERIAL];
        const resolved: { itemId: string; quantity: number }[] = [];
        for (const { code, quantity } of cost.materials) {
            const item = itemService.getByCode(code);
            if (!item) return fail(`Material "${code}" is missing`);
            if (countItem(materials, item.id) < quantity) return fail("Not enough materials");
            resolved.push({ itemId: item.id, quantity });
        }
        for (const { itemId, quantity } of resolved) {
            removeFromInventory(materials, itemId, quantity);
        }
        player.wallet = wallet;
        return done(undefined);
    }

    private update(
        player: PlayerWorldState,
        owned: OwnedEquipment,
        metadata: ItemEquipmentInstanceMetadata
    ) {
        owned.entry.metadata = metadata;
        if (owned.equippedSlot) player.refreshStats();
    }

    private findOwned(player: PlayerWorldState, instanceId: string): OwnedEquipment | undefined {
        const inBag = player.inventories[ItemType.EQUIPMENT].find(
            (candidate) => candidate.id === instanceId
        );
        if (inBag) return this.toOwned(inBag);
        for (const [slot, equipped] of Object.entries(player.equipments)) {
            if (equipped?.id === instanceId) {
                return this.toOwned(equipped, slot as ItemEquipmentSlotType);
            }
        }
        return undefined;
    }

    private toOwned(
        entry: InventoryItem | EquippedItem,
        equippedSlot?: ItemEquipmentSlotType
    ): OwnedEquipment | undefined {
        const item = itemService.getById(entry.itemId);
        if (item?.type !== ItemType.EQUIPMENT) return undefined;
        const template = item.metadata as EquipmentMetadata;
        return {
            entry,
            item,
            template,
            group: EQUIPMENT_GROUP_BY_TYPE[template.equipmentType],
            metadata: entry.metadata as ItemEquipmentInstanceMetadata,
            equippedSlot,
        };
    }

    private toInventoryEntry(equipped: EquippedItem, slotIndex: number): InventoryItem {
        return {
            id: equipped.id,
            itemId: equipped.itemId,
            slotIndex,
            quantity: 1,
            source: equipped.source,
            isLocked: equipped.isLocked,
            metadata: equipped.metadata,
        };
    }
}

export const inventoryWorldService = new InventoryWorldService();
