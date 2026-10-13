import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import { MonsterDropsSchema } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { MONSTER_DEFINITIONS } from "@/modules/monsters/seeds/monster.seed-data.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";

interface ItemDropSeed {
    itemCode: string;
    min: number;
    max: number;
    rate: number;
}

interface MonsterSeedEntry {
    code: string;
    level: number;
    biome: Biome;
    attackCooldownMs: number;
    /** Chỉ số gốc ở mốc level 1; tăng theo level bằng master data `monster_level_config`. */
    stats: Stats;
    skillCodes: string[];
    /**
     * Mức NORMAL / common — nhân theo loại × độ hiếm lúc chạy bằng master data `monster_scale_config`.
     * Quái thường (kể cả boss dungeon) chỉ rơi đá cường hoá + bình máu; trang bị biome là phần thưởng
     * clear dungeon (`clearEquipment` trong định nghĩa map).
     */
    drops: {
        /** Bỏ trống = không rơi vàng. */
        gold?: { min: number; max: number };
        exp: number;
        items: ItemDropSeed[];
    };
}

/** Hitbox / collider lấy từ prefab Unity — khai báo một chỗ ở `MONSTER_DEFINITIONS` (skill seed cũng dùng). */
const prefabOf = (code: string) => {
    const definition = MONSTER_DEFINITIONS.find((monster) => monster.code === code);
    if (!definition) throw new Error(`Monster "${code}" is missing from MONSTER_DEFINITIONS`);
    return { hitbox: definition.hitbox, collider: definition.collider };
};

/** Mỗi monster viết đủ chỉ số + thưởng của riêng nó; exp mẫu: 20 × lv × (1 + lv/10). */
const MONSTER_SEEDS: MonsterSeedEntry[] = [
    {
        code: "bat",
        level: 1,
        biome: Biome.SLIME,
        attackCooldownMs: 1700,
        stats: {
            [StatKey.MOVE_SPEED]: 1,
            [StatKey.CRITICAL_DAMAGE]: 1.5,
            [StatKey.MAX_HP]: 50,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.ACCURACY]: 1,
            [StatKey.EVASION]: 1,
        },
        skillCodes: ["bat_attack"],
        drops: {
            gold: { min: 1, max: 10 },
            exp: 22,
            items: [
                { itemCode: "enhance_stone_1", min: 1, max: 1, rate: 0.1 },
                { itemCode: "hp_potion_small", min: 1, max: 1, rate: 0.1 },
            ],
        },
    },
    {
        code: "slime",
        level: 1,
        biome: Biome.SLIME,
        attackCooldownMs: 1700,
        stats: {
            [StatKey.MOVE_SPEED]: 1,
            [StatKey.CRITICAL_DAMAGE]: 1.5,
            [StatKey.MAX_HP]: 50,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.ACCURACY]: 1,
            [StatKey.EVASION]: 1,
        },
        skillCodes: ["slime_attack"],
        drops: {
            gold: { min: 1, max: 10 },
            exp: 22,
            items: [
                { itemCode: "enhance_stone_1", min: 1, max: 1, rate: 0.1 },
                { itemCode: "hp_potion_small", min: 1, max: 1, rate: 0.1 },
            ],
        },
    },
    {
        code: "werewolf",
        level: 10,
        biome: Biome.WEREWOLF,
        attackCooldownMs: 1950,
        stats: {
            [StatKey.MOVE_SPEED]: 1,
            [StatKey.CRITICAL_DAMAGE]: 1.5,
            [StatKey.MAX_HP]: 50,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.ACCURACY]: 1,
            [StatKey.EVASION]: 1,
        },
        skillCodes: ["werewolf_attack"],
        drops: {
            gold: { min: 10, max: 100 },
            exp: 400,
            items: [
                { itemCode: "enhance_stone_2", min: 1, max: 1, rate: 0.1 },
                { itemCode: "hp_potion_small", min: 1, max: 1, rate: 0.1 },
            ],
        },
    },
    {
        code: "werebear",
        level: 20,
        biome: Biome.WEREBEAR,
        attackCooldownMs: 1950,
        stats: {
            [StatKey.MOVE_SPEED]: 1,
            [StatKey.CRITICAL_DAMAGE]: 1.5,
            [StatKey.MAX_HP]: 50,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.PHYSICAL_DEFENSE]: 1,
            [StatKey.ACCURACY]: 1,
            [StatKey.EVASION]: 1,
        },
        skillCodes: ["werebear_attack"],
        drops: {
            gold: { min: 20, max: 200 },
            exp: 1200,
            items: [
                { itemCode: "enhance_stone_2", min: 1, max: 1, rate: 0.1 },
                { itemCode: "hp_potion_small", min: 1, max: 1, rate: 0.1 },
            ],
        },
    },
    // Slime tập ở phòng tập: 1 tỷ máu, mọi chỉ số khác 0 (không di chuyển, không đánh, né 0), không rơi gì, không cho exp.
    {
        code: "training_slime",
        level: 1,
        biome: Biome.SLIME,
        attackCooldownMs: 1000,
        stats: {
            [StatKey.MAX_HP]: 1_000_000_000,
            [StatKey.MOVE_SPEED]: 0,
            [StatKey.CRITICAL_DAMAGE]: 0,
            [StatKey.PHYSICAL_ATTACK]: 0,
            [StatKey.MAGIC_ATTACK]: 0,
            [StatKey.PHYSICAL_DEFENSE]: 0,
            [StatKey.MAGIC_DEFENSE]: 0,
            [StatKey.ACCURACY]: 0,
            [StatKey.EVASION]: 0,
        },
        skillCodes: [],
        drops: { exp: 0, items: [] },
    },
];

/** Chạy sau SkillSeed và ItemSeed (tham chiếu skill/item theo id). */
export const MonsterSeed = async () => {
    for (const { skillCodes, drops, ...entry } of MONSTER_SEEDS) {
        const monster: NewMonster = {
            ...entry,
            ...prefabOf(entry.code),
            skills: await toOwnedSkills(skillCodes),
            drops: MonsterDropsSchema.parse({
                currency: drops.gold ? [{ code: CurrencyCode.GOLD, ...drops.gold }] : [],
                items: await toItemDrops(drops.items),
                exp: drops.exp,
            }),
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
