/**
 * Cấp sẵn đồ test cho các nhân vật trong `generated/local-test-tokens.json` (chạy sau `local-test-tokens.mjs`,
 * hoặc `yarn test:loadout`). Chỉ BỔ SUNG phần còn thiếu, không bao giờ hạ xuống: chạy lại bao nhiêu lần cũng
 * không làm đồ/level đang có bị mất hay nhân đôi.
 *
 * - level: nâng lên `TARGET_LEVEL` nếu đang thấp hơn (tối đa `level_config.maxLevel`)
 * - điểm attribute / kỹ năng chưa cộng: đủ như một nhân vật lên tới level đó (trừ điểm đã cộng)
 * - ví: gold / gem tối thiểu `TARGET_GOLD` / `TARGET_GEM`
 * - consumable / material: mỗi loại đủ `CONSUMABLE_QTY` / `MATERIAL_QTY`
 * - trang bị: mỗi món dùng được cho class (đang mặc hoặc trong túi) có ít nhất 1 bản, level theo biome
 *
 * Cần DB đã migrate + seed. Nhân vật đang online sẽ bị lệch revision → chạy lúc họ offline.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connectPostgres } from "@/configs/postgres.config.js";
import { setCacheDataApp } from "@/cache-data/index.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { equipmentFactoryService } from "@/modules/equipment/services/equipment-factory.service.js";
import { BIOME_EQUIPMENT_LEVEL, Biome } from "@/modules/biomes/enums/biome.enum.js";
import { STARTER_EQUIPMENT_LEVEL } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemRarity, ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import type { EquipmentMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { levelService } from "@/modules/levels/services/level.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import type { InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import { ATTRIBUTE_KEYS } from "@/modules/player/schemas/stat.schema.js";
import { inventoryService } from "@/modules/player/services/inventory.service.js";

/** Mức cấp cho mỗi nhân vật test — sửa số ở đây. */
const TARGET_LEVEL = 30;
const TARGET_GOLD = 1_000_000;
const TARGET_GEM = 1_000;
const CONSUMABLE_QTY = 9999;
const MATERIAL_QTY = 9999;
const EQUIPMENT_RARITY = ItemRarity.EPIC;

interface TokenFile {
    users: { email: string; classCode: string; player: { id: string; name: string } }[];
}

async function loadAccounts() {
    const file = join(process.cwd(), "generated", "local-test-tokens.json");
    try {
        return (JSON.parse(await readFile(file, "utf8")) as TokenFile).users;
    } catch {
        throw new Error(`Cannot read ${file} — run "node scripts/local-test-tokens.mjs" first`);
    }
}

async function giveLoadout(playerId: string, label: string) {
    const state = await PlayerStateRepo.findByPlayerId(playerId);
    if (!state) throw new Error(`${label}: player state not found`);
    const changes: string[] = [];
    const characterClass = classService.getByIdOrFail(state.classId);
    const config = masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);

    // ---- level + điểm chưa cộng ----
    const level = Math.max(state.level, Math.min(TARGET_LEVEL, levelService.maxLevel));
    if (level > state.level) changes.push(`level ${state.level} → ${level}`);

    const spentAttributes = ATTRIBUTE_KEYS.reduce(
        (sum, key) => sum + (state.allocatedAttributes[key] ?? 0),
        0
    );
    const attributePoints = Math.max(
        state.attributePoints,
        levelService.attributePointsPerLevel * (level - 1) - spentAttributes
    );
    if (attributePoints > state.attributePoints) {
        changes.push(`attributePoints ${state.attributePoints} → ${attributePoints}`);
    }
    const skillPoints = Math.max(state.skillPoints, levelService.skillPointsPerLevel * (level - 1));
    if (skillPoints > state.skillPoints) {
        changes.push(`skillPoints ${state.skillPoints} → ${skillPoints}`);
    }

    // ---- ví ----
    const wallet = structuredClone(state.wallet);
    for (const [code, target] of [
        [CurrencyCode.GOLD, TARGET_GOLD],
        [CurrencyCode.GEM, TARGET_GEM],
    ] as const) {
        const entry = (wallet[code] ??= { balance: 0, totalEarned: 0, totalSpent: 0 });
        if (entry.balance >= target) continue;
        const gained = target - entry.balance;
        entry.balance = target;
        entry.totalEarned += gained;
        changes.push(`${code} +${gained}`);
    }

    // ---- item: chỉ thêm phần thiếu ----
    const bags: Record<ItemType, InventoryItem[]> = {
        [ItemType.EQUIPMENT]: structuredClone(state.equipmentInventory),
        [ItemType.CONSUMABLE]: structuredClone(state.consumableInventory),
        [ItemType.MATERIAL]: structuredClone(state.materialInventory),
    };
    const equippedItemIds = new Set(
        Object.values(state.equipments).flatMap((equipped) => (equipped ? [equipped.itemId] : []))
    );

    let addedStacks = 0;
    let addedEquipment = 0;
    const skipped: string[] = [];
    const catalog = (await ItemRepo.findEnabled()).flatMap((row) => {
        const item = itemService.getById(row.id);
        return item ? [item] : [];
    });
    for (const item of catalog) {
        const size = config.inventorySize[item.type];
        if (item.type === ItemType.EQUIPMENT) {
            const template = item.metadata as EquipmentMetadata;
            if (template.classCode && template.classCode !== characterClass.code) continue;
            if (
                equippedItemIds.has(item.id) ||
                inventoryService.countItem(bags[item.type], item.id) > 0
            )
                continue;
            const itemLevel =
                template.biome === Biome.STARTER
                    ? STARTER_EQUIPMENT_LEVEL
                    : BIOME_EQUIPMENT_LEVEL[template.biome];
            try {
                const metadata = equipmentFactoryService.createInstance({
                    item,
                    level: itemLevel,
                    rarity: template.biome === Biome.STARTER ? ItemRarity.COMMON : EQUIPMENT_RARITY,
                });
                const { overflow } = inventoryService.addToInventory(
                    bags[item.type],
                    size,
                    item,
                    1,
                    {
                        source: ItemSource.SYSTEM,
                        metadata,
                    }
                );
                if (overflow > 0) skipped.push(`${item.code} (túi trang bị đầy)`);
                else addedEquipment++;
            } catch (err) {
                skipped.push(`${item.code} (${err instanceof Error ? err.message : String(err)})`);
            }
            continue;
        }
        const target = item.type === ItemType.CONSUMABLE ? CONSUMABLE_QTY : MATERIAL_QTY;
        const missing = target - inventoryService.countItem(bags[item.type], item.id);
        if (missing <= 0) continue;
        const { added, overflow } = inventoryService.addToInventory(
            bags[item.type],
            size,
            item,
            missing,
            {
                source: ItemSource.SYSTEM,
            }
        );
        if (added > 0) addedStacks++;
        if (overflow > 0) skipped.push(`${item.code} (thiếu ${overflow}, túi đầy)`);
    }
    if (addedEquipment) changes.push(`+${addedEquipment} trang bị`);
    if (addedStacks) changes.push(`+${addedStacks} loại consumable/material`);

    if (changes.length === 0) {
        console.info(`  ${label}: đã đủ, không đổi gì`);
    } else {
        await PlayerStateRepo.updateByPlayerId(playerId, {
            level,
            ...(level > state.level ? { exp: 0 } : {}),
            attributePoints,
            skillPoints,
            wallet,
            equipmentInventory: bags[ItemType.EQUIPMENT],
            consumableInventory: bags[ItemType.CONSUMABLE],
            materialInventory: bags[ItemType.MATERIAL],
        });
        console.info(`  ${label}: ${changes.join(", ")}`);
    }
    for (const reason of skipped) console.warn(`    bỏ qua ${reason}`);
}

try {
    await connectPostgres();
    await setCacheDataApp();
    const accounts = await loadAccounts();
    console.info(
        `Cấp đồ test (level ${TARGET_LEVEL}, trang bị ${EQUIPMENT_RARITY}) cho ${accounts.length} nhân vật:`
    );
    for (const account of accounts) {
        await giveLoadout(account.player.id, `${account.player.name} (${account.classCode})`);
    }
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
