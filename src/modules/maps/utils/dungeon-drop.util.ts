import type { Big } from "@/core/utils/big-number.util.js";
import type { DungeonDropTuning } from "@/modules/maps/entities/game-map.entity.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { RewardScale } from "@/modules/rewards/utils/reward-roll.util.js";

/** Nhân hệ số thưởng của dungeon vào hệ số sẵn có (loại × độ hiếm). */
export const applyDungeonScale = (scale: RewardScale, tuning: DungeonDropTuning): RewardScale => ({
    exp: scale.exp.times(tuning.expMultiplier ?? 1) as Big,
    gold: scale.gold.times(tuning.goldMultiplier ?? 1) as Big,
    dropRate: scale.dropRate.times(tuning.dropRateMultiplier ?? 1) as Big,
});

/**
 * Bảng drop của quái trong dungeon: ghi đè trang bị (tỉ lệ / rarity) và thêm item rơi riêng.
 * `itemId` tra id từ code (item không có thì bỏ qua dòng đó).
 */
export const tuneDungeonDrops = (
    drops: MonsterDrops,
    tuning: DungeonDropTuning,
    options: { boss: boolean; itemId: (itemCode: string) => string | undefined }
): MonsterDrops => {
    const equipment =
        drops.equipment && (tuning.equipmentRate !== undefined || tuning.equipmentRarity)
            ? {
                  rate: tuning.equipmentRate ?? drops.equipment.rate,
                  rarity: tuning.equipmentRarity ?? drops.equipment.rarity,
              }
            : drops.equipment;
    const extra = (tuning.extraItems ?? []).flatMap((drop) => {
        const itemId = options.itemId(drop.itemCode);
        if (!itemId || (drop.bossOnly && !options.boss)) return [];
        return [{ itemId, min: drop.min, max: drop.max, rate: drop.rate }];
    });
    return { ...drops, equipment, items: [...drops.items, ...extra] };
};
