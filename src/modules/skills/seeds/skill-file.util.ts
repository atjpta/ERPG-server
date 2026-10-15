import { readdirSync, readFileSync } from "node:fs";
import type { NewSkill } from "@/modules/skills/entities/skill.entity.js";
import { HitDelivery } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import {
    SkillFileSchema,
    type SkillFile,
    type SkillFileHit,
} from "@/modules/skills/schemas/skill-file.schema.js";
import { hitEvent, level } from "@/modules/skills/seeds/skill-build.util.js";

const DATA_DIR = new URL("../data/", import.meta.url);

/** Every `data/*.skill.json` (authored in the Unity Skill Lab), validated; the file name must be the skill code. */
export const loadSkillFiles = (): SkillFile[] =>
    readdirSync(DATA_DIR)
        .filter((file) => file.endsWith(".skill.json"))
        .sort()
        .map((file) => {
            const skill = SkillFileSchema.parse(
                JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf-8"))
            );
            if (`${skill.code}.skill.json` !== file) {
                throw new Error(
                    `[SkillFile] ${file}: code "${skill.code}" does not match the file name`
                );
            }
            if (!skill.code.startsWith(`${skill.classCode}_`)) {
                throw new Error(
                    `[SkillFile] ${file}: code must start with "${skill.classCode}_" (its animation clip is the rest)`
                );
            }
            return skill;
        });

const toHitEvent = (hit: SkillFileHit, eventIndex: number): SkillHitEvent => {
    const base = hitEvent({
        eventIndex,
        triggerTicks: hit.triggerTicks,
        shape: hit.shape,
        range: hit.range,
        width: hit.width,
        height: hit.height,
        radius: hit.radius,
        angle: hit.angle,
        aimed: hit.aimed,
        damageScaling: hit.damageScaling,
        damageScalingType: hit.damageScalingType,
        damageType: hit.damageType,
        stunMs: hit.stunMs,
        knockback: hit.knockback,
        delivery: hit.delivery,
        projectile: hit.projectile,
        area: hit.area,
    });
    // Buff zones and ally heals hit nothing by themselves: they carry their own numbers instead of damage.
    if (hit.delivery === HitDelivery.AURA) return { ...base, effects: [], aura: hit.aura };
    if (hit.delivery === HitDelivery.ALLIES) return { ...base, effects: [], allies: hit.allies };
    return base;
};

/** The `skills` row of a skill file. */
export const skillFileToRow = (skill: SkillFile): NewSkill => ({
    code: skill.code,
    skillType: skill.skillType,
    targetType: skill.targetType,
    castRange: skill.castRange,
    castTimeMs: skill.castTimeMs,
    animationMs: skill.animationMs,
    cooldownMs: skill.cooldownMs,
    manaCost: skill.manaCost,
    staminaCost: skill.staminaCost,
    maxLevel: skill.maxLevel,
    basicAttack: skill.basicAttack,
    levelConfig: Array.from({ length: skill.maxLevel }, (_, i) =>
        level(
            i + 1,
            0,
            Math.round((skill.levels.start + skill.levels.step * i) * 100) / 100,
            skill.levels.scalingType
        )
    ),
    skillHitEvents: skill.hits.map(toHitEvent),
    ...(skill.charge && { chargeConfig: skill.charge }),
});

/**
 * The class's skill codes with its file skills put in: a file skill with a `slot` goes to that position (so it can sit
 * between the seeded ones), the others go last.
 */
export const withFileSkills = (
    classCode: string,
    seeded: readonly string[],
    files: readonly SkillFile[] = loadSkillFiles()
): string[] => {
    const codes = [...seeded];
    const mine = files
        .filter((skill) => skill.classCode === classCode)
        .sort(
            (a, b) => (a.slot ?? Infinity) - (b.slot ?? Infinity) || a.code.localeCompare(b.code)
        );
    for (const skill of mine) {
        if (codes.includes(skill.code)) continue;
        codes.splice(Math.min(skill.slot ?? codes.length, codes.length), 0, skill.code);
    }
    return codes;
};
