import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";

const MONSTERS: NewMonster[] = [
    {
        code: "orc",
        name: "Orc",
        level: 1,
        maxHp: 100,
        attack: 5,
        defense: 0,
        moveSpeed: 2.6,
        attackRange: 0.85,
        attackCooldownMs: 1000,
    },
];

export const MonsterSeed = async (force = false) => {
    for (const monster of MONSTERS) {
        await MonsterRepo.upsert({
            data: monster,
            target: Monsters.code,
            matchValue: monster.code,
            updateData: force ? monster : undefined,
        });
    }
    console.info("✅ [MonsterSeed] Done");
};
