import { equipmentConfigService } from "@/modules/equipment/services/equipment-config.service.js";
import { equipmentFactoryService } from "@/modules/equipment/services/equipment-factory.service.js";
import {
    pickWeighted,
    dropLevelOf,
    type Rng,
} from "@/modules/equipment/services/equipment-roll.service.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { Monster } from "@/modules/monsters/entities/monster.entity.js";
import { scaleDropsToLevel } from "@/modules/monsters/services/monster-spawn.service.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type {
    EquipmentDrop,
    MonsterDrops,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
import {
    combineRewardScale,
    monsterScales,
    type MonsterVariant,
} from "@/modules/monsters/services/monster-stat.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { ItemReward, Reward } from "@/modules/rewards/types/reward.type.js";
import {
    rollDropRarity,
    rollMonsterReward,
} from "@/modules/rewards/services/reward-roll.service.js";

/**
 * Roll phần thưởng khi giết monster, kể cả trang bị biome (cần catalog item + master data); exp,
 * tiền, tỉ lệ rơi nhân theo loại × độ hiếm (`monster_scale_config`).
 */
export class MonsterRewardService {
    roll(
        monster: Pick<Monster, "level" | "biome"> &
            MonsterVariant & {
                drops: MonsterDrops;
                /** Level của monster gốc (nơi `drops` được seed) — quái sinh ở level khác thì thưởng đổi theo. */
                baseLevel?: number;
            },
        rng: Rng = Math.random
    ): Reward {
        const scaleConfig = masterDataCacheService.get(MasterDataKey.MONSTER_SCALE_CONFIG);
        const scaled = scaleDropsToLevel(
            monster.drops,
            monster.baseLevel ?? monster.level,
            monster.level
        );
        return rollMonsterReward(scaled, {
            rng,
            scale: combineRewardScale(monsterScales(monster, scaleConfig)),
            rollEquipment: (drop) => this.rollEquipment(monster.biome, drop, rng),
        });
    }

    /** 1 món trang bị của biome: ngẫu nhiên class + loại, level theo `equipment_drop_config`, rarity theo trọng số. */
    rollEquipment(
        biome: Biome,
        drop: EquipmentDrop,
        rng: Rng = Math.random
    ): ItemReward | undefined {
        const level = dropLevelOf(biome, equipmentConfigService.drop);
        const templates = itemService.listEquipmentsByBiome(biome);
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
    }
}

export const monsterRewardService = new MonsterRewardService();
