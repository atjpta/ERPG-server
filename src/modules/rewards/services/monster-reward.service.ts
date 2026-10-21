import { equipmentFactoryService } from "@/modules/equipment/services/equipment-factory.service.js";
import {
    type Rng,
    equipmentRollService,
} from "@/modules/equipment/services/equipment-roll.service.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { Monster } from "@/modules/monsters/entities/monster.entity.js";
import { monsterSpawnService } from "@/modules/monsters/services/monster-spawn.service.js";
import type { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type {
    EquipmentDrop,
    MonsterDrops,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
import {
    type MonsterVariant,
    monsterStatService,
} from "@/modules/monsters/services/monster-stat.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { ItemReward, Reward } from "@/modules/rewards/types/reward.type.js";
import { rewardRollService } from "@/modules/rewards/services/reward-roll.service.js";

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
        const scaled = monsterSpawnService.scaleDropsToLevel(
            monster.drops,
            monster.baseLevel ?? monster.level,
            monster.level
        );
        return rewardRollService.rollMonsterReward(scaled, {
            rng,
            scale: monsterStatService.combineRewardScale(
                monsterStatService.monsterScales(monster, scaleConfig)
            ),
            rollEquipment: (drop) => this.rollEquipment(monster.biome, drop, rng),
        });
    }

    /** 1 món trang bị của biome: ngẫu nhiên class + loại, level theo `equipment_drop_config`, rarity theo trọng số. */
    rollEquipment(
        biome: Biome,
        drop: EquipmentDrop,
        rng: Rng = Math.random
    ): ItemReward | undefined {
        const level = equipmentRollService.dropLevelOf(
            biome,
            masterDataCacheService.get(MasterDataKey.EQUIPMENT_DROP_CONFIG)
        );
        const templates = itemService.listEquipmentsByBiome(biome);
        const item = equipmentRollService.pickWeighted(templates, () => 1, rng);
        if (level === undefined || !item) return undefined;
        try {
            const metadata = equipmentFactoryService.createInstance({
                item,
                level,
                rarity: rewardRollService.rollDropRarity(drop, rng),
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
