import { CalcService } from "@/core/calc/calc.service.js";
import type { CalcValue } from "@/core/calc/calc.interface.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { Response } from "@/core/response/response.js";
import type {
    EnhanceStep,
    EquipmentDisassembleConfig,
    EquipmentEnhanceConfig,
    EquipmentRefineConfig,
    RefineStep,
    WeightedStatRange,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import { MAX_ENHANCE_LEVEL } from "@/modules/equipment/schemas/equipment-config.schema.js";
import { equipmentRollService } from "@/modules/equipment/services/equipment-roll.service.js";
import type { Rng } from "@/modules/equipment/types/equipment-roll.type.js";
import { EquipmentInstanceState } from "@/modules/equipment/state/equipment-instance.state.js";
import type { EquipmentGroup } from "@/modules/items/enums/item-equipment.enum.js";
import { ItemSource, ItemType, type ItemRarity } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { Inventories, InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { InventoryState } from "@/modules/player/state/inventory.state.js";
import { WalletState } from "@/modules/player/state/wallet.state.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type {
    MaterialCost,
    UpgradeCost,
} from "@/modules/equipment/types/equipment-upgrade.type.js";

export class EquipmentUpgradeService {
    private levelScale(scales: Record<string, number>, level: number) {
        const calc = new CalcService("big");
        return calc.of(scales[String(level)] ?? 1);
    }

    /** Chi phí sau khi nhân hệ số — làm tròn lên. */
    private scaled(value: number, scale: CalcValue) {
        const calc = new CalcService("big");
        return calc.of(value).times(scale).ceil();
    }

    /** Gộp các dòng cùng code, bỏ dòng số lượng 0. */
    private mergeMaterials(materials: MaterialCost[]): MaterialCost[] {
        const totals = new Map<string, number>();
        for (const { code, quantity } of materials) {
            if (quantity > 0) totals.set(code, (totals.get(code) ?? 0) + quantity);
        }
        return [...totals].map(([code, quantity]) => ({ code, quantity }));
    }

    /** Chi phí lên +`enhanceLevel + 1`, hoặc lý do không cường hoá được. */
    enhanceCost(
        instance: ItemEquipmentInstanceMetadata,
        group: EquipmentGroup,
        config: EquipmentEnhanceConfig
    ): Response<UpgradeCost & { step: EnhanceStep }> {
        if (instance.enhanceLevel >= MAX_ENHANCE_LEVEL) {
            return Response.error(ItemErrorCode.EQUIPMENT_MAX_ENHANCE);
        }
        if (instance.enhanceLevel >= config.maxByRarity[instance.rarity]) {
            return Response.error(ItemErrorCode.EQUIPMENT_NEEDS_REFINE);
        }
        const step = config.steps[instance.enhanceLevel];
        const scale = this.levelScale(config.levelCostScale, instance.level);
        return Response.success({
            step,
            rate: step.rate,
            gold: this.scaled(step.gold, scale),
            materials: this.mergeMaterials([
                { code: step.stoneCode, quantity: this.scaled(step.stoneQty, scale) },
                { code: config.dustCodeByGroup[group], quantity: this.scaled(step.dustQty, scale) },
            ]),
        });
    }

    /** Kết quả cường hoá: thành công +1; thất bại tụt 1 cấp nếu bậc đó `downgradeOnFail`. */
    applyEnhance(
        instance: ItemEquipmentInstanceMetadata,
        step: EnhanceStep,
        success: boolean
    ): ItemEquipmentInstanceMetadata {
        const enhanceLevel = success
            ? instance.enhanceLevel + 1
            : step.downgradeOnFail
              ? Math.max(0, instance.enhanceLevel - 1)
              : instance.enhanceLevel;
        return { ...instance, enhanceLevel };
    }

    /** Chi phí tinh hoá lên rarity kế tiếp, hoặc lý do không tinh hoá được. */
    refineCost(
        instance: ItemEquipmentInstanceMetadata,
        config: EquipmentRefineConfig
    ): Response<UpgradeCost & { step: RefineStep; target: ItemRarity }> {
        const target = equipmentRollService.nextRarity(instance.rarity);
        const step = target ? config.steps[target] : undefined;
        if (!target || !step) return Response.error(ItemErrorCode.EQUIPMENT_MAX_RARITY);
        const scale = this.levelScale(config.levelCostScale, instance.level);
        return Response.success({
            step,
            target,
            rate: step.rate,
            gold: this.scaled(step.gold, scale),
            materials: this.mergeMaterials([
                { code: config.spiritCode, quantity: this.scaled(step.spiritQty, scale) },
            ]),
        });
    }

    /**
     * Tinh hoá thành công: lên rarity `target`, refineLevel +1, thêm dòng rarity cho đủ
     * `rarityLineCount[target]` (thường là 1 dòng, không trùng dòng đang có).
     */
    applyRefine(params: {
        instance: ItemEquipmentInstanceMetadata;
        target: ItemRarity;
        rarityLineCount: Record<ItemRarity, number>;
        rarityPool: readonly WeightedStatRange[];
        rng: Rng;
    }): ItemEquipmentInstanceMetadata {
        const { instance, target, rarityLineCount, rarityPool, rng } = params;
        const missing = Math.max(1, rarityLineCount[target] - instance.rarityStats.length);
        return {
            ...instance,
            rarity: target,
            refineLevel: instance.refineLevel + 1,
            rarityStats: [
                ...instance.rarityStats,
                ...equipmentRollService.rollPoolLines(
                    rarityPool,
                    missing,
                    rng,
                    instance.rarityStats
                ),
            ],
        };
    }

    /**
     * Nguyên liệu nhận khi phân rã: tinh linh (theo rarity) + bụi đúng nhóm (theo cấp cường hoá),
     * cùng nhân theo level đồ và nhóm.
     */
    disassembleCosts(
        instance: ItemEquipmentInstanceMetadata,
        group: EquipmentGroup,
        config: EquipmentDisassembleConfig
    ): MaterialCost[] {
        const calc = new CalcService("big");
        const common = this.levelScale(config.levelScale, instance.level).times(
            config.groupScale[group]
        );
        const spirit = calc
            .of(config.spiritBase)
            .times(common)
            .times(config.rarityScale[instance.rarity])
            .floor();
        const enhanceScale = config.enhanceScale[instance.enhanceLevel] ?? 1;
        const dust = calc.of(config.dustBase).times(common).times(enhanceScale).floor();
        return this.mergeMaterials([
            { code: config.spiritCode, quantity: spirit },
            { code: config.dustCodeByGroup[group], quantity: dust },
        ]);
    }

    /** Có thành công không (so `rng()` với tỉ lệ `rate`). */
    rollSuccess(rate: number, rng: Rng) {
        const calc = new CalcService("big");
        return calc.of(rng()).lt(rate);
    }

    /**
     * Trừ vàng + nguyên liệu `cost` (kiểm tra đủ hết rồi mới trừ): sửa trực tiếp túi `materials`, trả ví
     * mới (ví thật do world làm chủ nên không sửa ở đây).
     */
    pay(
        materials: InventoryState,
        wallet: Wallet,
        cost: UpgradeCost
    ): Response<{ wallet: Wallet }> {
        const paid = structuredClone(wallet);
        if (!new WalletState(paid).debit([{ code: CurrencyCode.GOLD, amount: cost.gold }]))
            return Response.error(ItemErrorCode.CURRENCY_NOT_ENOUGH);
        const resolved: { itemId: string; quantity: number }[] = [];
        for (const { code, quantity } of cost.materials) {
            const item = itemService.getByCode(code);
            if (!item) return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH, { code });
            if (materials.count(ItemType.MATERIAL, item.id) < quantity)
                return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH);
            resolved.push({ itemId: item.id, quantity });
        }
        for (const { itemId, quantity } of resolved) {
            materials.remove(ItemType.MATERIAL, itemId, quantity);
        }
        return Response.success({ wallet: paid });
    }

    /** Tính phân rã trên bản sao túi nguyên liệu — dùng chung cho phân rã thật và xem trước. */
    simulateDisassemble(
        inventories: Inventories,
        instanceIds: string[]
    ): Response<{
        ids: string[];
        materials: InventoryItem[];
        received: { itemId: string; code: string; rarity: ItemRarity; quantity: number }[];
    }> {
        const ids = [...new Set(instanceIds)];
        const bag = inventories[ItemType.EQUIPMENT];
        const costs: MaterialCost[] = [];
        for (const id of ids) {
            const entry = bag.find((candidate) => candidate.id === id);
            if (!entry) return Response.error(ItemErrorCode.ITEM_NOT_FOUND);
            if (entry.isLocked) return Response.error(ItemErrorCode.ITEM_LOCKED);
            const owned = EquipmentInstanceState.from(entry);
            if (!owned) return Response.error(ItemErrorCode.ITEM_NOT_EQUIPMENT);
            costs.push(
                ...this.disassembleCosts(
                    owned.metadata,
                    owned.group,
                    masterDataCacheService.get(MasterDataKey.EQUIPMENT_DISASSEMBLE_CONFIG)
                )
            );
        }

        const materials = new InventoryState({
            ...inventories,
            [ItemType.MATERIAL]: structuredClone(inventories[ItemType.MATERIAL]),
        });
        const received = new Map<
            string,
            { itemId: string; code: string; rarity: ItemRarity; quantity: number }
        >();
        for (const { code, quantity } of costs) {
            const item = itemService.getByCode(code);
            if (!item) return Response.error(ItemErrorCode.ITEM_NOT_ENOUGH, { code });
            const { overflow } = materials.add(ItemType.MATERIAL, item, quantity, {
                source: ItemSource.CRAFT,
            });
            if (overflow > 0) return Response.error(ItemErrorCode.INVENTORY_FULL);
            const current = received.get(code) ?? {
                itemId: item.id,
                code,
                rarity: item.rarity,
                quantity: 0,
            };
            current.quantity += quantity;
            received.set(code, current);
        }
        return Response.success({
            ids,
            materials: materials.bag(ItemType.MATERIAL),
            received: [...received.values()],
        });
    }
}

export const equipmentUpgradeService = new EquipmentUpgradeService();
