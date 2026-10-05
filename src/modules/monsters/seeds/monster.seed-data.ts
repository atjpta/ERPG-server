/**
 * Danh sách monster lấy từ project Unity (`Assets/ERPG/Prefabs/Monsters/<Biome>/<Tên>.prefab`):
 * hitbox = BoxCollider2D `HitBox`, collider = BoxCollider2D `Collider` (size → width/height,
 * offset → offsetX/offsetY, đơn vị tile, Y dương hướng lên — `worldUnitsPerTile` = 1). Server gửi
 * các giá trị này xuống và client ghi đè collider của prefab, nên sửa prefab phải sửa ở đây.
 *
 * `attackClipMs` = độ dài clip `Attack1` (12 fps; Orc: `Orc_Attack01`, 10 fps) — thời lượng đòn đánh.
 * Dùng chung cho SkillSeed (skill `{code}_attack`) và MonsterSeed.
 */
import { Biome } from "@/modules/biomes/enums/biome.enum.js";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";

export interface MonsterDefinition {
    code: string;
    name: string;
    biome: Biome;
    level: number;
    type: MonsterType;
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

export const MONSTER_DEFINITIONS: MonsterDefinition[] = [
    // ---- Orc (lv 1–9)
    {
        code: "orc",
        name: "Orc",
        biome: Biome.ORC,
        level: 1,
        type: MonsterType.NORMAL,
        hitbox: box(0.4, 0.5, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 600,
        attackSkillCode: "orc_slash",
    },
    {
        code: "armored_orc",
        name: "Armored Orc",
        biome: Biome.ORC,
        level: 5,
        type: MonsterType.NORMAL,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.4, 0.1, 0, 0.1),
        attackClipMs: 583,
    },
    {
        code: "elite_orc",
        name: "Elite Orc",
        biome: Biome.ORC,
        level: 7,
        type: MonsterType.ELITE,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 583,
    },
    {
        code: "orc_rider",
        name: "Orc Rider",
        biome: Biome.ORC,
        level: 9,
        type: MonsterType.BOSS,
        hitbox: box(0.7, 0.9, 0, 0.5),
        collider: box(0.6, 0.1, 0, 0.1),
        attackClipMs: 667,
    },
    // ---- Skeleton (lv 10–19)
    {
        code: "skeleton",
        name: "Skeleton",
        biome: Biome.SKELETON,
        level: 10,
        type: MonsterType.NORMAL,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 500,
    },
    {
        code: "skeleton_archer",
        name: "Skeleton Archer",
        biome: Biome.SKELETON,
        level: 12,
        type: MonsterType.NORMAL,
        hitbox: box(0.4, 0.6, 0.05, 0.35),
        collider: box(0.3, 0.1, 0.05, 0.1),
        attackClipMs: 750,
        ranged: true,
    },
    {
        code: "armored_skeleton",
        name: "Armored Skeleton",
        biome: Biome.SKELETON,
        level: 15,
        type: MonsterType.ELITE,
        hitbox: box(0.5, 0.6, 0.05, 0.35),
        collider: box(0.4, 0.1, 0.05, 0.1),
        attackClipMs: 667,
    },
    {
        code: "greatsword_skeleton",
        name: "Greatsword Skeleton",
        biome: Biome.SKELETON,
        level: 17,
        type: MonsterType.NORMAL,
        hitbox: box(0.5, 0.6, 0.05, 0.35),
        collider: box(0.4, 0.1, 0.05, 0.1),
        attackClipMs: 750,
    },
    {
        code: "necromancer",
        name: "Necromancer",
        biome: Biome.SKELETON,
        level: 19,
        type: MonsterType.BOSS,
        hitbox: box(0.6, 0.9, 0, 0.5),
        collider: box(0.5, 0.1, 0, 0.1),
        attackClipMs: 750,
        ranged: true,
    },
    // ---- ShapeShifter (lv 20–30)
    {
        code: "bat",
        name: "Bat",
        biome: Biome.SHAPESHIFTER,
        level: 20,
        type: MonsterType.NORMAL,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 500,
    },
    {
        code: "slime",
        name: "Slime",
        biome: Biome.SHAPESHIFTER,
        level: 22,
        type: MonsterType.NORMAL,
        hitbox: box(0.7, 0.4, 0, 0.3),
        collider: box(0.7, 0.1, 0, 0.1),
        attackClipMs: 500,
    },
    {
        code: "lancer",
        name: "Lancer",
        biome: Biome.SHAPESHIFTER,
        level: 24,
        type: MonsterType.NORMAL,
        hitbox: box(0.9, 0.9, 0.13, 0.5),
        collider: box(0.6, 0.1, 0, 0.1),
        attackClipMs: 500,
    },
    {
        code: "werebear",
        name: "Werebear",
        biome: Biome.SHAPESHIFTER,
        level: 27,
        type: MonsterType.ELITE,
        hitbox: box(0.6, 0.6, 0, 0.35),
        collider: box(0.6, 0.1, 0, 0.1),
        attackClipMs: 750,
    },
    {
        code: "werewolf",
        name: "Werewolf",
        biome: Biome.SHAPESHIFTER,
        level: 30,
        type: MonsterType.BOSS,
        hitbox: box(0.4, 0.6, 0, 0.35),
        collider: box(0.3, 0.1, 0, 0.1),
        attackClipMs: 750,
    },
];

/** Code skill đánh thường của monster. */
export const monsterAttackSkillCode = (monster: MonsterDefinition) =>
    monster.attackSkillCode ?? `${monster.code}_attack`;
