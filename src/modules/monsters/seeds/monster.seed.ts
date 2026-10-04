import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";

/** `skillCodes` theo thứ tự; skill MELEE đầu tiên là đòn đánh thường. Chạy sau SkillSeed. */
const MONSTERS: (Omit<NewMonster, "skills"> & { skillCodes: string[] })[] = [
    {
        code: "orc",
        name: "Orc",
        level: 1,
        maxHp: 500,
        attack: 5,
        defense: 0,
        moveSpeed: 2,
        attackRange: 0.85,
        attackCooldownMs: 2000,
        hitbox: { width: 0.4, height: 0.5, offsetX: 0, offsetY: 0 },
        collider: { width: 0.4, height: 0.1, offsetX: 0, offsetY: 0 },
        skillCodes: ["orc_slash"],
    },
];

export const MonsterSeed = async () => {
    for (const { skillCodes, ...rest } of MONSTERS) {
        const monster: NewMonster = { ...rest, skills: await toOwnedSkills(skillCodes) };
        await MonsterRepo.upsert({
            data: monster,
            target: Monsters.code,
            matchValue: monster.code,
            updateData: monster,
        });
    }
    console.info("✅ [MonsterSeed] Done");
};
