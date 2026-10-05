import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import {
    MonsterDropsSchema,
    type CurrencyDrop,
    type EquipmentDrop,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
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

interface MonsterSeedData extends Omit<NewMonster, "skills" | "drops"> {
    /** Theo thứ tự; skill MELEE đầu tiên là đòn đánh thường. */
    skillCodes: string[];
    /** Như cột `drops` nhưng item ghi theo code. */
    drops: {
        currency: CurrencyDrop[];
        items: ItemDropSeed[];
        equipment?: EquipmentDrop;
        exp: number;
    };
}

/** Tỉ lệ rarity mặc định của đồ biome rơi ra. */
const EQUIPMENT_DROP: EquipmentDrop = {
    rate: 0.08,
    rarity: {
        [ItemRarity.COMMON]: 60,
        [ItemRarity.GOOD]: 25,
        [ItemRarity.RARE]: 10,
        [ItemRarity.EPIC]: 4,
        [ItemRarity.LEGENDARY]: 1,
    },
};

/** Nguyên liệu nâng cấp rơi từ mọi quái biome (đá theo bậc tăng dần theo độ khó). */
const materialDrops = (stoneTier: number): ItemDropSeed[] => [
    { itemCode: `enhance_stone_${stoneTier}`, min: 1, max: 2, rate: 0.25 },
    { itemCode: "dust_weapon", min: 1, max: 3, rate: 0.15 },
    { itemCode: "dust_armor", min: 1, max: 3, rate: 0.15 },
    { itemCode: "dust_accessory", min: 1, max: 3, rate: 0.15 },
    { itemCode: "spirit", min: 1, max: 2, rate: 0.05 },
    { itemCode: "hp_potion_small", min: 1, max: 1, rate: 0.1 },
];

const BASE_STATS: Stats = {
    [StatKey.MOVE_SPEED]: 2,
    [StatKey.CRITICAL_DAMAGE]: 1.5,
};

/** Chạy sau SkillSeed và ItemSeed (tham chiếu skill/item theo id). */
const MONSTERS: MonsterSeedData[] = [
    {
        code: "orc",
        name: "Orc",
        level: 1,
        biome: Biome.ORC,
        attackCooldownMs: 2000,
        hitbox: { width: 0.4, height: 0.5, offsetX: 0, offsetY: 0 },
        collider: { width: 0.4, height: 0.1, offsetX: 0, offsetY: 0 },
        skillCodes: ["orc_slash"],
        type: MonsterType.NORMAL,
        rarity: ItemRarity.COMMON,
        stats: BASE_STATS,
        statsPerLevel: {
            [StatKey.MAX_HP]: 50,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.ACCURACY]: 1,
            [StatKey.EVASION]: 1,
        },
        drops: {
            currency: [{ code: CurrencyCode.GOLD, min: 1, max: 10 }],
            items: materialDrops(1),
            equipment: EQUIPMENT_DROP,
            exp: 20,
        },
    },
    // Tạm dùng đòn đánh của orc — chỉnh lại khi có skill + sprite riêng.
    {
        code: "skeleton",
        name: "Skeleton",
        level: 15,
        biome: Biome.SKELETON,
        attackCooldownMs: 1800,
        hitbox: { width: 0.4, height: 0.5, offsetX: 0, offsetY: 0 },
        collider: { width: 0.4, height: 0.1, offsetX: 0, offsetY: 0 },
        skillCodes: ["orc_slash"],
        type: MonsterType.NORMAL,
        rarity: ItemRarity.COMMON,
        stats: BASE_STATS,
        statsPerLevel: {
            [StatKey.MAX_HP]: 45,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.PHYSICAL_DEFENSE]: 1,
            [StatKey.ACCURACY]: 1,
            [StatKey.EVASION]: 1,
        },
        drops: {
            currency: [{ code: CurrencyCode.GOLD, min: 10, max: 40 }],
            items: materialDrops(2),
            equipment: EQUIPMENT_DROP,
            exp: 120,
        },
    },
    {
        code: "shapeshifter",
        name: "Shapeshifter",
        level: 25,
        biome: Biome.SHAPESHIFTER,
        attackCooldownMs: 1600,
        hitbox: { width: 0.4, height: 0.5, offsetX: 0, offsetY: 0 },
        collider: { width: 0.4, height: 0.1, offsetX: 0, offsetY: 0 },
        skillCodes: ["orc_slash"],
        type: MonsterType.NORMAL,
        rarity: ItemRarity.COMMON,
        stats: { ...BASE_STATS, [StatKey.MOVE_SPEED]: 2.4 },
        statsPerLevel: {
            [StatKey.MAX_HP]: 45,
            [StatKey.PHYSICAL_ATTACK]: 6,
            [StatKey.ACCURACY]: 1.2,
            [StatKey.EVASION]: 1.5,
        },
        drops: {
            currency: [{ code: CurrencyCode.GOLD, min: 25, max: 80 }],
            items: materialDrops(3),
            equipment: EQUIPMENT_DROP,
            exp: 300,
        },
    },
];

export const MonsterSeed = async () => {
    for (const { skillCodes, drops, ...rest } of MONSTERS) {
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
