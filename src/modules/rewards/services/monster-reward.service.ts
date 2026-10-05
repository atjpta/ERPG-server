import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import { equipmentFactoryService } from "@/modules/equipment/services/equipment-factory.service.js";
import {
    pickWeighted,
    rollDropLevel,
    type Rng,
} from "@/modules/equipment/utils/equipment-roll.util.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { Monster } from "@/modules/monsters/entities/monster.entity.js";
import type { MonsterDrops } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { combineRewardScale, monsterScales } from "@/modules/monsters/utils/monster-stat.util.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";
import { rollDropRarity, rollMonsterReward } from "@/modules/rewards/utils/reward-roll.util.js";

/**
 * Roll phần thưởng khi giết monster, kể cả trang bị biome (cần catalog item + master data); exp,
 * tiền, tỉ lệ rơi nhân theo loại × độ hiếm (`monster_scale_config`).
 */
export class MonsterRewardService {
    roll(
        monster: Pick<Monster, "type" | "rarity" | "level" | "biome"> & { drops: MonsterDrops },
        rng: Rng = Math.random
    ): Reward {
        const scaleConfig = masterDataCacheService.get(MasterDataKey.MONSTER_SCALE_CONFIG);
        return rollMonsterReward(monster.drops, {
            rng,
            scale: combineRewardScale(monsterScales(monster, scaleConfig)),
            rollEquipment: (drop) => {
                const level = rollDropLevel(monster.level, equipmentConfigService.drop, rng);
                const templates = itemService.listEquipmentsByBiome(monster.biome);
                const item = pickWeighted(templates, () => 1, rng);
                if (level === undefined || !item) return undefined;
                try {
                    const metadata = equipmentFactoryService.createInstance({
                        item,
                        level,
                        rarity: rollDropRarity(drop, rng),
                        rng,
                    });
                    return { itemId: item.id, quantity: 1, metadata };
                } catch (err) {
                    // Thiếu bảng stat cho mốc level này → bỏ qua món đó, không làm hỏng lượt thưởng.
                    console.error("[MonsterReward] Equipment drop skipped:", err);
                    return undefined;
                }
            },
        });
    }
}

export const monsterRewardService = new MonsterRewardService();
