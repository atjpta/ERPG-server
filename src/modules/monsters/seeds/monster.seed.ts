import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";

const MONSTERS: NewMonster[] = [
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
        hitbox: { width: 0.5, height: 0.6, offsetX: 0, offsetY: -0.3 },
        collider: { width: 0.31, height: 0.12, offsetX: 0, offsetY: 0.1 },
    },
];

export const MonsterSeed = async () => {
    for (const monster of MONSTERS) {
        await MonsterRepo.upsert({
            data: monster,
            target: Monsters.code,
            matchValue: monster.code,
            updateData: monster,
        });
    }
    console.info("✅ [MonsterSeed] Done");
};
