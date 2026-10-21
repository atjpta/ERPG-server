import { Big, big, floorBig } from "@/core/utils/big-number.util.js";
import {
    type Rng,
    equipmentRollService,
} from "@/modules/equipment/services/equipment-roll.service.js";
import { ItemRarity, ItemSource } from "@/modules/items/enums/item.enum.js";
import type {
    EquipmentDrop,
    MonsterDrops,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
import type { ItemReward, Reward } from "@/modules/rewards/types/reward.type.js";

/** Hệ số thưởng của monster (loại × độ hiếm) — `monster_scale_config`. */
export interface RewardScale {
    exp: Big;
    gold: Big;
    dropRate: Big;
}

const NO_SCALE: RewardScale = { exp: big(1), gold: big(1), dropRate: big(1) };

export class RewardRollService {
    /** Số nguyên ngẫu nhiên trong [min, max] (gồm cả hai đầu). */
    randomInt(min: number, max: number, rng: Rng = Math.random) {
        return min + floorBig(big(max - min + 1).times(rng()));
    }

    /** Trúng tỉ lệ `rate` (0 → 1). */
    rollChance(rate: Big | number, rng: Rng = Math.random) {
        return big(rng()).lt(rate);
    }

    /** Tỉ lệ sau khi nhân hệ số, tối đa 1. */
    private scaledRate(rate: number, scale: Big) {
        return Big.min(1, scale.times(rate));
    }

    /** Rarity theo trọng số của drop; không cấu hình → common. */
    rollDropRarity(drop: EquipmentDrop, rng: Rng = Math.random): ItemRarity {
        return (
            equipmentRollService.pickWeighted(
                Object.entries(drop.rarity) as [ItemRarity, number][],
                ([, weight]) => weight,
                rng
            )?.[0] ?? ItemRarity.COMMON
        );
    }

    /**
     * Roll phần thưởng khi giết một monster: tiền random trong [min, max] của từng loại, item thường
     * theo tỉ lệ + số lượng, exp cố định — rồi nhân hệ số `scale` (exp, tiền, tỉ lệ rơi). Trang bị biome
     * do `rollEquipment` tạo (cần config + catalog).
     */
    rollMonsterReward(
        drops: MonsterDrops,
        options: {
            rng?: Rng;
            scale?: RewardScale;
            rollEquipment?: (drop: EquipmentDrop) => ItemReward | undefined;
        } = {}
    ): Reward {
        const { rng = Math.random, scale = NO_SCALE, rollEquipment } = options;
        const items: ItemReward[] = drops.items
            .filter((drop) => this.rollChance(this.scaledRate(drop.rate, scale.dropRate), rng))
            .map((drop) => ({
                itemId: drop.itemId,
                quantity: this.randomInt(drop.min, drop.max, rng),
            }));
        if (
            drops.equipment &&
            rollEquipment &&
            this.rollChance(this.scaledRate(drops.equipment.rate, scale.dropRate), rng)
        ) {
            const equipment = rollEquipment(drops.equipment);
            if (equipment) items.push(equipment);
        }
        return {
            currency: drops.currency
                .map((drop) => ({
                    code: drop.code,
                    amount: floorBig(scale.gold.times(this.randomInt(drop.min, drop.max, rng))),
                }))
                .filter((reward) => reward.amount > 0),
            items,
            source: ItemSource.DROP,
            exp: floorBig(scale.exp.times(drops.exp)),
        };
    }
}

export const rewardRollService = new RewardRollService();
