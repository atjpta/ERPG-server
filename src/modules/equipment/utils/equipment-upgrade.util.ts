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
    nextRarity,
    rollPoolLines,
    type Rng,
} from "@/modules/equipment/utils/equipment-roll.util.js";
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
export type UpgradeCheck<T> = { ok: true; value: T } | { ok: false; reason: string };

const levelScale = (scales: Record<string, number>, level: number) =>
    big(scales[String(level)] ?? 1);
/** Chi phí sau khi nhân hệ số — làm tròn lên. */
const scaled = (value: number, scale: Big) =>
    big(value).times(scale).integerValue(Big.ROUND_CEIL).toNumber();

/** Gộp các dòng cùng code, bỏ dòng số lượng 0. */
const mergeMaterials = (materials: MaterialCost[]): MaterialCost[] => {
    const totals = new Map<string, number>();
    for (const { code, quantity } of materials) {
        if (quantity > 0) totals.set(code, (totals.get(code) ?? 0) + quantity);
    }
    return [...totals].map(([code, quantity]) => ({ code, quantity }));
};

/** Chi phí lên +`enhanceLevel + 1`, hoặc lý do không cường hoá được. */
export function enhanceCost(
    instance: ItemEquipmentInstanceMetadata,
    group: EquipmentGroup,
    config: EquipmentEnhanceConfig
): UpgradeCheck<UpgradeCost & { step: EnhanceStep }> {
    if (instance.enhanceLevel >= MAX_ENHANCE_LEVEL) {
        return { ok: false, reason: "Equipment is at max enhance level" };
    }
    if (instance.enhanceLevel >= config.maxByRarity[instance.rarity]) {
        return { ok: false, reason: "Refine the equipment to enhance further" };
    }
    const step = config.steps[instance.enhanceLevel];
    const scale = levelScale(config.levelCostScale, instance.level);
    return {
        ok: true,
        value: {
            step,
            rate: step.rate,
            gold: scaled(step.gold, scale),
            materials: mergeMaterials([
                { code: step.stoneCode, quantity: scaled(step.stoneQty, scale) },
                { code: config.dustCodeByGroup[group], quantity: scaled(step.dustQty, scale) },
            ]),
        },
    };
}

/** Kết quả cường hoá: thành công +1; thất bại tụt 1 cấp nếu bậc đó `downgradeOnFail`. */
export function applyEnhance(
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
export function refineCost(
    instance: ItemEquipmentInstanceMetadata,
    config: EquipmentRefineConfig
): UpgradeCheck<UpgradeCost & { step: RefineStep; target: ItemRarity }> {
    const target = nextRarity(instance.rarity);
    const step = target ? config.steps[target] : undefined;
    if (!target || !step) return { ok: false, reason: "Equipment is at max rarity" };
    const scale = levelScale(config.levelCostScale, instance.level);
    return {
        ok: true,
        value: {
            step,
            target,
            rate: step.rate,
            gold: scaled(step.gold, scale),
            materials: mergeMaterials([
                { code: config.spiritCode, quantity: scaled(step.spiritQty, scale) },
            ]),
        },
    };
}

/**
 * Tinh hoá thành công: lên rarity `target`, refineLevel +1, thêm dòng rarity cho đủ
 * `rarityLineCount[target]` (thường là 1 dòng, không trùng dòng đang có).
 */
export function applyRefine(params: {
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
            ...rollPoolLines(rarityPool, missing, rng, instance.rarityStats),
        ],
    };
}

/**
 * Nguyên liệu nhận khi phân rã: tinh linh (theo rarity) + bụi đúng nhóm (theo cấp cường hoá),
 * cùng nhân theo level đồ và nhóm.
 */
export function disassembleYield(
    instance: ItemEquipmentInstanceMetadata,
    group: EquipmentGroup,
    config: EquipmentDisassembleConfig
): MaterialCost[] {
    const common = levelScale(config.levelScale, instance.level).times(config.groupScale[group]);
    const spirit = floorBig(
        big(config.spiritBase).times(common).times(config.rarityScale[instance.rarity])
    );
    const enhanceScale = config.enhanceScale[instance.enhanceLevel] ?? 1;
    const dust = floorBig(big(config.dustBase).times(common).times(enhanceScale));
    return mergeMaterials([
        { code: config.spiritCode, quantity: spirit },
        { code: config.dustCodeByGroup[group], quantity: dust },
    ]);
}
