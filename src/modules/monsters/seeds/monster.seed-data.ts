/**
 * Danh sách monster lấy từ project Unity (`Assets/ERPG/Prefabs/Monsters/<Biome>/<Tên>.prefab`):
 * hitbox = BoxCollider2D `HitBox`, collider = BoxCollider2D `Collider` (size → width/height,
 * offset → offsetX/offsetY, đơn vị tile, Y dương hướng lên — `worldUnitsPerTile` = 1). Server gửi
 * các giá trị này xuống và client ghi đè collider của prefab, nên sửa prefab phải sửa ở đây.
 *
 * `attackClipMs` = độ dài clip `Attack1` (12 fps) — thời lượng đòn đánh.
 * Dùng chung cho SkillSeed (skill `{code}_attack`) và MonsterSeed.
 */
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import type { MonsterLevelConfig } from "@/modules/monsters/schemas/monster-level-config.schema.js";
import type { MonsterScaleConfig } from "@/modules/monsters/schemas/monster-scale-config.schema.js";
import type { MonsterSpawnConfig } from "@/modules/monsters/schemas/monster-spawn-config.schema.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

export interface MonsterDefinition {
    code: string;
    biome: Biome;
    level: number;
    hitbox: CollisionBounds;
    collider: CollisionBounds;
    attackClipMs: number;
    /** Đánh xa (bắn tên / phép): vùng đánh dài, đứng xa mới ra đòn. */
    ranged?: boolean;
    /** Skill đánh thường đã chỉnh tay (mặc định sinh `{code}_attack` theo hitbox). */
    attackSkillCode?: string;
}

const box = (width: number, height: number, offsetX: number, offsetY: number) => ({
    width,
    height,
    offsetX,
    offsetY,
});

/**
 * `level` = level gốc (mốc scale chỉ số/thưởng); level thật do `monsterLevel` của map/dungeon quyết định.
 * Bat thuộc biome slime (rơi set slime); tinh anh/boss là `type` của spawn, không phải monster riêng.
 */
export const MONSTER_DEFINITIONS: MonsterDefinition[] = [
    {
        code: "bat",
        biome: Biome.SLIME,
        level: 1,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 500,
    },
    {
        code: "slime",
        biome: Biome.SLIME,
        level: 1,
        hitbox: box(0.7, 0.4, 0, 0.3),
        collider: box(0.7, 0.1, 0, 0.1),
        attackClipMs: 500,
    },
    {
        code: "werebear",
        biome: Biome.WEREBEAR,
        level: 20,
        hitbox: box(0.6, 0.6, 0, 0.35),
        collider: box(0.6, 0.1, 0, 0.1),
        attackClipMs: 750,
    },
    {
        code: "werewolf",
        biome: Biome.WEREWOLF,
        level: 10,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 750,
    },
];

/** Code skill đánh thường của monster. */
export const monsterAttackSkillCode = (monster: MonsterDefinition) =>
    monster.attackSkillCode ?? `${monster.code}_attack`;

/**
 * Mặc định master data `monster_level_config` — +100% chỉ số gốc mỗi level (stat = base × level),
 * move_speed / critical_damage không tăng.
 */
export const DEFAULT_MONSTER_LEVEL_CONFIG: MonsterLevelConfig = {
    statsPerLevel: {
        [StatKey.MAX_HP]: 1,
        [StatKey.PHYSICAL_ATTACK]: 1,
        [StatKey.MAGIC_ATTACK]: 1,
        [StatKey.PHYSICAL_DEFENSE]: 1,
        [StatKey.MAGIC_DEFENSE]: 1,
        [StatKey.ACCURACY]: 1,
        [StatKey.EVASION]: 1,
    },
};

const attackDefense = (attack: number, defense: number) => ({
    [StatKey.PHYSICAL_ATTACK]: attack,
    [StatKey.MAGIC_ATTACK]: attack,
    [StatKey.PHYSICAL_DEFENSE]: defense,
    [StatKey.MAGIC_DEFENSE]: defense,
});

/**
 * Mặc định master data `monster_scale_config` — loại × độ hiếm nhân với nhau. `size`: elite ×1.2,
 * boss ×1.5 (to hơn cả sprite, hitbox, collider, vùng đánh).
 */
export const DEFAULT_MONSTER_SCALE_CONFIG: MonsterScaleConfig = {
    byType: {
        [MonsterType.NORMAL]: { stats: {}, exp: 1, gold: 1, dropRate: 1, size: 1 },
        [MonsterType.ELITE]: {
            stats: { [StatKey.MAX_HP]: 3, ...attackDefense(1.5, 1.3) },
            exp: 3,
            gold: 3,
            dropRate: 3,
            size: 1.2,
        },
        [MonsterType.BOSS]: {
            stats: { [StatKey.MAX_HP]: 10, ...attackDefense(2, 1.6) },
            exp: 10,
            gold: 10,
            // 8% × 12.5 = luôn rơi trang bị.
            dropRate: 12.5,
            size: 1.5,
        },
    },
    byRarity: {
        [ItemRarity.COMMON]: { stats: {}, exp: 1, gold: 1, dropRate: 1, size: 1 },
        [ItemRarity.GOOD]: {
            stats: { [StatKey.MAX_HP]: 1.2, ...attackDefense(1.1, 1.1) },
            exp: 1.2,
            gold: 1.2,
            dropRate: 1.2,
            size: 1,
        },
        [ItemRarity.RARE]: {
            stats: { [StatKey.MAX_HP]: 1.5, ...attackDefense(1.25, 1.2) },
            exp: 1.5,
            gold: 1.5,
            dropRate: 1.5,
            size: 1,
        },
        [ItemRarity.EPIC]: {
            stats: { [StatKey.MAX_HP]: 2, ...attackDefense(1.5, 1.35) },
            exp: 2,
            gold: 2,
            dropRate: 2,
            size: 1,
        },
        [ItemRarity.LEGENDARY]: {
            stats: { [StatKey.MAX_HP]: 3, ...attackDefense(2, 1.5) },
            exp: 3,
            gold: 3,
            dropRate: 3,
            size: 1,
        },
    },
};

/**
 * Mặc định master data `monster_spawn_config`: spawn `random` có 10% ra elite (tối đa 1 con elite sống
 * trong map); độ hiếm roll theo trọng số của loại — normal hiếm dần, elite/boss lệch về độ hiếm cao.
 */
export const DEFAULT_MONSTER_SPAWN_CONFIG: MonsterSpawnConfig = {
    maxElitesPerMap: 1,
    eliteChance: 0.1,
    rarityWeights: {
        [MonsterType.NORMAL]: {
            [ItemRarity.COMMON]: 80,
            [ItemRarity.GOOD]: 15,
            [ItemRarity.RARE]: 5,
        },
        [MonsterType.ELITE]: {
            [ItemRarity.GOOD]: 50,
            [ItemRarity.RARE]: 35,
            [ItemRarity.EPIC]: 15,
        },
        [MonsterType.BOSS]: {
            [ItemRarity.RARE]: 40,
            [ItemRarity.EPIC]: 45,
            [ItemRarity.LEGENDARY]: 15,
        },
    },
};
