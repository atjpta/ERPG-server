import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { Big, big, floorBig } from "@/core/utils/big-number.util.js";
import type {
    EnhanceStep,
    EquipmentDisassembleConfig,
    EquipmentEnhanceConfig,
    EquipmentRefineConfig,
    RefineStep,
    WeightedStatRange,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import { MAX_ENHANCE_LEVEL } from "@/modules/equipment/schemas/equipment-config.schema.js";
import {
    type Rng,
    equipmentRollService,
} from "@/modules/equipment/services/equipment-roll.service.js";
import type { EquipmentGroup } from "@/modules/items/enums/item-equipment.enum.js";
import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";

/** Nguyên liệu theo code item. */
export interface MaterialCost {
    code: string;
    quantity: number;
}

export interface UpgradeCost {
    rate: number;
    gold: number;
    materials: MaterialCost[];
}

/** Lỗi nghiệp vụ trả về client (không throw). */
export type UpgradeCheck<T> = Result<T>;

export class EquipmentUpgradeService {
    private levelScale(scales: Record<string, number>, level: number) {
        return big(scales[String(level)] ?? 1);
    }

    /** Chi phí sau khi nhân hệ số — làm tròn lên. */
    private scaled(value: number, scale: Big) {
        return big(value).times(scale).integerValue(Big.ROUND_CEIL).toNumber();
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
    ): UpgradeCheck<UpgradeCost & { step: EnhanceStep }> {
        if (instance.enhanceLevel >= MAX_ENHANCE_LEVEL) {
            return fail(ItemErrorCode.EQUIPMENT_MAX_ENHANCE);
        }
        if (instance.enhanceLevel >= config.maxByRarity[instance.rarity]) {
            return fail(ItemErrorCode.EQUIPMENT_NEEDS_REFINE);
        }
        const step = config.steps[instance.enhanceLevel];
        const scale = this.levelScale(config.levelCostScale, instance.level);
        return ok({
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
    ): UpgradeCheck<UpgradeCost & { step: RefineStep; target: ItemRarity }> {
        const target = equipmentRollService.nextRarity(instance.rarity);
        const step = target ? config.steps[target] : undefined;
        if (!target || !step) return fail(ItemErrorCode.EQUIPMENT_MAX_RARITY);
        const scale = this.levelScale(config.levelCostScale, instance.level);
        return ok({
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
        const common = this.levelScale(config.levelScale, instance.level).times(
            config.groupScale[group]
        );
        const spirit = floorBig(
            big(config.spiritBase).times(common).times(config.rarityScale[instance.rarity])
        );
        const enhanceScale = config.enhanceScale[instance.enhanceLevel] ?? 1;
        const dust = floorBig(big(config.dustBase).times(common).times(enhanceScale));
        return this.mergeMaterials([
            { code: config.spiritCode, quantity: spirit },
            { code: config.dustCodeByGroup[group], quantity: dust },
        ]);
    }
}

export const equipmentUpgradeService = new EquipmentUpgradeService();
