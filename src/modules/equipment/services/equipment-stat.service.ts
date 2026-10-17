import { big, bigToNumber } from "@/core/utils/big-number.util.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { EquipmentSetEntry } from "@/modules/equipment/schemas/equipment-config.schema.js";
import type { EquipmentGroup } from "@/modules/items/enums/item-equipment.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { StatBonus } from "@/modules/player/schemas/stat.schema.js";

export interface MainStatGrowth {
    /** `equipment_enhance_config.mainStatGrowth` (1.05). */
    enhance: number;
    /** `equipment_refine_config.mainStatGrowth` (1.1). */
    refine: number;
}

/** Hệ số main stats = enhance ^ enhanceLevel × refine ^ refineLevel (2 phần nhân riêng). */
export const mainStatMultiplier = (
    instance: Pick<ItemEquipmentInstanceMetadata, "enhanceLevel" | "refineLevel">,
    growth: MainStatGrowth
) =>
    big(growth.enhance)
        .pow(instance.enhanceLevel)
        .times(big(growth.refine).pow(instance.refineLevel));

/** Bonus của 1 món: main stats (đã nhân hệ số cường hoá/tinh hoá) + sub + rarity. */
export function equipmentBonuses(
    instance: ItemEquipmentInstanceMetadata,
    growth: MainStatGrowth
): StatBonus[] {
    const multiplier = mainStatMultiplier(instance, growth);
    return [
        ...instance.mainStats.map((line) => ({
            ...line,
            value: bigToNumber(big(line.value).times(multiplier)),
        })),
        ...instance.subStats,
        ...instance.rarityStats,
    ];
}

/** Món đang mặc tính set: cùng biome + class + nhóm + level mới đếm chung. */
export interface SetPiece {
    biome: Biome;
    classCode: string | null;
    group: EquipmentGroup;
    level: number;
}

/**
 * Bonus set đang kích hoạt: đếm số món theo (biome, class, nhóm, level), cộng mọi mốc trong
 * `bonuses` có số món ≤ số đang mặc. Đồ tân thủ / đồ dùng chung không có set.
 */
export function setBonuses(
    pieces: readonly SetPiece[],
    findSet: (
        biome: Biome,
        classCode: string,
        group: EquipmentGroup,
        level: number
    ) => EquipmentSetEntry | undefined
): StatBonus[] {
    const counts = new Map<string, { piece: SetPiece & { classCode: string }; count: number }>();
    for (const piece of pieces) {
        if (piece.biome === Biome.STARTER || piece.classCode === null) continue;
        const key = `${piece.biome}:${piece.classCode}:${piece.group}:${piece.level}`;
        const current = counts.get(key);
        if (current) current.count++;
        else counts.set(key, { piece: { ...piece, classCode: piece.classCode }, count: 1 });
    }
    const bonuses: StatBonus[] = [];
    for (const { piece, count } of counts.values()) {
        const entry = findSet(piece.biome, piece.classCode, piece.group, piece.level);
        if (!entry) continue;
        for (const [pieces, lines] of Object.entries(entry.bonuses)) {
            if (count >= Number(pieces)) bonuses.push(...lines);
        }
    }
    return bonuses;
}
