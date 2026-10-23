import { CalcService } from "@/core/calc/calc.service.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { EquipmentSetEntry } from "@/modules/equipment/schemas/equipment-config.schema.js";
import type { EquipmentGroup } from "@/modules/items/enums/item-equipment.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { StatBonus } from "@/modules/player/schemas/stat.schema.js";
import type { MainStatGrowth, SetPiece } from "@/modules/equipment/types/equipment-stat.type.js";

export class EquipmentStatService {
    /** Hệ số main stats = enhance ^ enhanceLevel × refine ^ refineLevel (2 phần nhân riêng). */
    mainStatMultiplier(
        instance: Pick<ItemEquipmentInstanceMetadata, "enhanceLevel" | "refineLevel">,
        growth: MainStatGrowth
    ) {
        const calc = new CalcService("big");
        return calc
            .of(growth.enhance)
            .pow(instance.enhanceLevel)
            .times(calc.of(growth.refine).pow(instance.refineLevel));
    }

    /** Bonus của 1 món: main stats (đã nhân hệ số cường hoá/tinh hoá) + sub + rarity. */
    equipmentBonuses(instance: ItemEquipmentInstanceMetadata, growth: MainStatGrowth): StatBonus[] {
        const calc = new CalcService("big");
        const multiplier = this.mainStatMultiplier(instance, growth);
        return [
            ...instance.mainStats.map((line) => ({
                ...line,
                value: calc.of(line.value).times(multiplier).toNumber(),
            })),
            ...instance.subStats,
            ...instance.rarityStats,
        ];
    }

    /**
     * Bonus set đang kích hoạt: đếm số món theo (biome, class, nhóm, level), cộng mọi mốc trong
     * `bonuses` có số món ≤ số đang mặc. Đồ tân thủ / đồ dùng chung không có set.
     */
    setBonuses(
        pieces: readonly SetPiece[],
        findSet: (
            biome: Biome,
            classCode: string,
            group: EquipmentGroup,
            level: number
        ) => EquipmentSetEntry | undefined
    ): StatBonus[] {
        const counts = new Map<
            string,
            { piece: SetPiece & { classCode: string }; count: number }
        >();
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
}

export const equipmentStatService = new EquipmentStatService();
