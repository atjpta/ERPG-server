import { Skills, type NewSkill } from "@/modules/skills/entities/skill.entity.js";
import { hitEvent, level } from "@/modules/skills/seeds/skill-build.util.js";
import { loadSkillFiles, skillFileToRow } from "@/modules/skills/seeds/skill-file.util.js";
import { skillClipWarnings } from "@/modules/bodies/utils/anim-clip.util.js";
import { HitShape, SkillType, TargetType } from "@/modules/skills/enums/skill.enum.js";
import { SkillRepo } from "@/modules/skills/repositories/skill.repository.js";
import { big, bigToNumber, floorBig } from "@/core/utils/big-number.util.js";
import {
    MONSTER_DEFINITIONS,
    monsterAttackSkillCode,
    type MonsterDefinition,
} from "@/modules/monsters/seeds/monster.seed-data.js";
import { BASE_SKILL_TICK_RATE } from "@/rooms/world/utils/tick.world.util.js";

/**
 * Skill của class (đòn đánh thường, skill chủ động, dash) không nằm ở đây: chúng là file `data/<code>.skill.json` do Skill Lab
 * của Unity ghi ra (`skill-file.util.ts`). Ở đây chỉ còn đòn đánh của monster — sinh từ hitbox và clip `Attack1` của prefab Unity.
 */
const round2 = (value: ReturnType<typeof big>) => bigToNumber(value.decimalPlaces(2));

/**
 * Đòn đánh thường của monster, vùng RECT ước theo hitbox của nó (hitbox 0.4 × 0.5 cho vùng 1.08 × 0.84): bắt đầu sau lưng 0.13 ô, vươn trước mặt
 * 0.55 × √(hitbox.width / 0.4) ô; cao 1.4 × hitbox.height + 0.14, tâm ở giữa thân. Monster đánh xa
 * dùng vùng dài 4 ô trước mặt. Trúng đòn ở ~60% clip Attack1. Chỉnh tay bằng WorldColliderDebugView.
 */
const monsterAttackSkill = (monster: MonsterDefinition): NewSkill => {
    const { hitbox } = monster;
    const halfWidth = big(hitbox.width).div(2);
    const offsetX = monster.ranged ? big(0) : halfWidth.plus(0.13).negated();
    const reach = big(0.55).times(big(hitbox.width).div(0.4).sqrt());
    const range = monster.ranged ? big(4) : halfWidth.plus(reach).minus(offsetX);
    const triggerTicks = Math.max(
        1,
        floorBig(big(monster.attackClipMs).times(0.6).times(BASE_SKILL_TICK_RATE).div(1000))
    );
    return {
        code: monsterAttackSkillCode(monster),
        skillType: SkillType.MELEE,
        targetType: TargetType.DIRECTION,
        castRange: round2(range.plus(offsetX)),
        castTimeMs: 0,
        animationMs: monster.attackClipMs,
        cooldownMs: 0,
        manaCost: 0,
        staminaCost: 0,
        maxLevel: 1,
        basicAttack: true,
        levelConfig: [level(1, 2, 0.25)],
        skillHitEvents: [
            hitEvent({
                eventIndex: 0,
                triggerTicks,
                shape: HitShape.RECT,
                range: round2(range.plus(offsetX)),
                width: monster.ranged ? 0.5 : round2(big(hitbox.height).times(1.4).plus(0.14)),
                damageScaling: monster.ranged ? 1 : 1.25,
            }),
        ],
    };
};

const MONSTER_SKILLS: NewSkill[] = MONSTER_DEFINITIONS.filter(
    (monster) => !monster.attackSkillCode && !monster.noAttack
).map(monsterAttackSkill);

/** Skill đã bỏ: tắt (`enabled = false`) chứ không xoá, để dữ liệu cũ còn tra được. ClassSeed gán lại bộ skill mặc định cho player. */
const RETIRED_SKILL_CODES = [
    "swordsman_triple_strike",
    "swordsman_shockwave_slash",
    "cleric_aura_buff",
];

export const SkillSeed = async () => {
    const fileSkills = loadSkillFiles();
    const seededCodes = new Set(MONSTER_SKILLS.map((skill) => skill.code));
    for (const file of fileSkills) {
        if (seededCodes.has(file.code)) {
            throw new Error(
                `[SkillSeed] ${file.code}.skill.json: the code is already in skill.seed.ts`
            );
        }
    }
    const authored = fileSkills.map(skillFileToRow);

    for (const skill of [...MONSTER_SKILLS, ...authored]) {
        await SkillRepo.upsert({
            data: skill,
            target: Skills.code,
            matchValue: skill.code,
            updateData: skill,
        });
    }

    for (const code of RETIRED_SKILL_CODES) {
        const retired = await SkillRepo.findByCode({ code });
        if (retired?.enabled)
            await SkillRepo.updateById({ id: retired.id, data: { enabled: false } });
    }

    // Class skills are authored in Unity, but must not outlast the Unity clip they play.
    const timed = authored.map((skill) => ({
        code: skill.code,
        animationMs: skill.animationMs ?? 0,
        castTimeMs: skill.castTimeMs ?? 0,
        skillHitEvents: skill.skillHitEvents ?? [],
    }));
    for (const warning of skillClipWarnings(timed)) console.warn(`⚠️ [SkillSeed] ${warning}`);

    console.info("✅ [SkillSeed] Done");
};
