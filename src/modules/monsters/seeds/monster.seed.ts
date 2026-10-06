import { big, floorBig } from "@/core/utils/big-number.util.js";
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import {
    MonsterDropsSchema,
    type CurrencyDrop,
    type EquipmentDrop,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
import {
    MONSTER_DEFINITIONS,
    monsterAttackSkillCode,
    type MonsterDefinition,
} from "@/modules/monsters/seeds/monster.seed-data.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";

interface ItemDropSeed {
    itemCode: string;
    min: number;
    max: number;
    rate: number;
}

/**
 * Chỉ số + thưởng ở đây là mức NORMAL / common — nhân theo loại × độ hiếm lúc chạy bằng master data
 * `monster_scale_config` (máu, công, exp, vàng, tỉ lệ rơi).
 */
const BASE_EQUIPMENT_DROP_RATE = 0.08;

/** Đá cường hoá rơi theo biome (bậc tăng dần theo độ khó). */
const STONE_TIER_BY_BIOME: Record<Biome, number> = {
    [Biome.STARTER]: 1,
    [Biome.ORC]: 1,
    [Biome.SKELETON]: 2,
    [Biome.SHAPESHIFTER]: 3,
};

/** Loại monster cấu hình theo spawn của map → bảng rơi chung, elite/boss nhân qua scale config. */
const EQUIPMENT_DROP: EquipmentDrop = {
    rate: BASE_EQUIPMENT_DROP_RATE,
    rarity: {
        [ItemRarity.COMMON]: 60,
        [ItemRarity.GOOD]: 25,
        [ItemRarity.RARE]: 10,
        [ItemRarity.EPIC]: 4,
        [ItemRarity.LEGENDARY]: 1,
    },
};

const materialDrops = (stoneTier: number): ItemDropSeed[] => [
    { itemCode: `enhance_stone_${stoneTier}`, min: 1, max: 2, rate: 0.25 },
    { itemCode: "dust_weapon", min: 1, max: 3, rate: 0.15 },
    { itemCode: "dust_armor", min: 1, max: 3, rate: 0.15 },
    { itemCode: "dust_accessory", min: 1, max: 3, rate: 0.15 },
    { itemCode: "spirit", min: 1, max: 2, rate: 0.05 },
    { itemCode: "hp_potion_small", min: 1, max: 1, rate: 0.1 },
];

/** Tạm: chỉ số gốc (mốc level 1) / thưởng sinh theo level — cân bằng lại sau. */
function toSeed(monster: MonsterDefinition) {
    // Tăng theo level bằng master data `monster_level_config`.
    const stats: Stats = {
        [StatKey.MOVE_SPEED]: 2,
        [StatKey.CRITICAL_DAMAGE]: 1.5,
        [StatKey.MAX_HP]: 50,
        [StatKey.PHYSICAL_ATTACK]: 5,
        [StatKey.ACCURACY]: 1,
        [StatKey.EVASION]: 1,
        ...(monster.biome === Biome.SKELETON ? { [StatKey.PHYSICAL_DEFENSE]: 1 } : {}),
    };
    // 20 × lv × (1 + lv/10): lv1 = 22, lv10 = 400, lv30 = 2400.
    const exp = floorBig(big(20).times(monster.level).times(big(monster.level).div(10).plus(1)));
    const gold: CurrencyDrop = {
        code: CurrencyCode.GOLD,
        min: monster.level,
        max: monster.level * 10,
    };
    return {
        code: monster.code,
        level: monster.level,
        biome: monster.biome,
        // Đòn đánh + nghỉ 1.2 s giữa 2 đòn.
        attackCooldownMs: monster.attackClipMs + 1200,
        hitbox: monster.hitbox,
        collider: monster.collider,
        stats,
        skillCodes: [monsterAttackSkillCode(monster)],
        drops: {
            currency: [gold],
            items: materialDrops(STONE_TIER_BY_BIOME[monster.biome]),
            equipment: EQUIPMENT_DROP,
            exp,
        },
    };
}

/** Code monster cũ không còn dùng (placeholder trước khi có prefab). */
const LEGACY_MONSTER_CODES = ["shapeshifter"];

/** Chạy sau SkillSeed và ItemSeed (tham chiếu skill/item theo id). */
export const MonsterSeed = async () => {
    for (const { skillCodes, drops, ...rest } of MONSTER_DEFINITIONS.map(toSeed)) {
        const monster: NewMonster = {
            ...rest,
            skills: await toOwnedSkills(skillCodes),
            drops: MonsterDropsSchema.parse({ ...drops, items: await toItemDrops(drops.items) }),
        };
        await MonsterRepo.upsert({
            data: monster,
            target: Monsters.code,
            matchValue: monster.code,
            updateData: monster,
        });
    }
    for (const code of LEGACY_MONSTER_CODES) {
        const legacy = await MonsterRepo.findByCode({ code });
        if (legacy?.enabled) {
            await MonsterRepo.updateById({ id: legacy.id, data: { enabled: false } });
        }
    }
    console.info("✅ [MonsterSeed] Done");
};

async function toItemDrops(items: ItemDropSeed[]) {
    return Promise.all(
        items.map(async ({ itemCode, ...drop }) => {
            const item = await ItemRepo.findByCode({ code: itemCode });
            if (!item) throw new Error(`Item "${itemCode}" not found — run ItemSeed first`);
            return { ...drop, itemId: item.id };
        })
    );
}
