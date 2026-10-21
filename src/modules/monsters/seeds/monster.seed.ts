import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import { MonsterDropsSchema } from "@/modules/monsters/schemas/monster-drop.schema.js";
import { MONSTER_DEFINITIONS } from "@/modules/monsters/seeds/monster.seed-data.js";
import { loadResolvedMonsters } from "@/modules/monsters/seeds/monster-file.util.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { unityMasterDataService } from "@/modules/master-data/services/unity-master-data.service.js";
import { resolveMonsterAi } from "@/modules/monsters/schemas/monster-ai-config.schema.js";
import type { MonsterDropsFile } from "@/modules/monsters/schemas/monster-file.schema.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { Stats } from "@/modules/player/schemas/stat.schema.js";
import { loadSkillFiles, monsterSkillCodes } from "@/modules/skills/seeds/skill-file.util.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";

/** Hitbox / collider lấy từ prefab Unity — khai báo một chỗ ở `MONSTER_DEFINITIONS` (skill seed cũng dùng). */
const prefabOf = (code: string) => {
    const definition = MONSTER_DEFINITIONS.find((monster) => monster.code === code);
    if (!definition) throw new Error(`Monster "${code}" is missing from MONSTER_DEFINITIONS`);
    return { hitbox: definition.hitbox, collider: definition.collider };
};

/**
 * Monsters are files `data/<code>.monster.json` that the Monster Lab in Unity writes, over `data/monster-defaults.json`:
 * a monster lists only the numbers that differ from the default. Speed comes from `monster_ai_config`, hitbox and collider
 * from the prefab, attacks from the skill files with the monster's code.
 * Chạy sau SkillSeed và ItemSeed (tham chiếu skill/item theo id).
 */
export const MonsterSeed = async () => {
    const aiConfig = unityMasterDataService.loadUnityMasterData(MasterDataKey.MONSTER_AI_CONFIG);
    const skillFiles = loadSkillFiles();
    for (const { drops, ...entry } of loadResolvedMonsters()) {
        const monster: NewMonster = {
            ...entry,
            // Speed is authored in Unity (Ranges tab): a base for every monster, a monster's own number over it.
            stats: {
                ...(entry.stats as Stats),
                [StatKey.MOVE_SPEED]: resolveMonsterAi(aiConfig, entry.code).moveSpeed,
            },
            ...prefabOf(entry.code),
            // Attacks are skill files authored in Unity (Skill Lab), given to the monster by `monsterCode`.
            skills: await toOwnedSkills(monsterSkillCodes(entry.code, skillFiles)),
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

async function toItemDrops(items: MonsterDropsFile["items"]) {
    return Promise.all(
        items.map(async ({ itemCode, ...drop }) => {
            const item = await ItemRepo.findByCode({ code: itemCode });
            if (!item) throw new Error(`Item "${itemCode}" not found — run ItemSeed first`);
            return { ...drop, itemId: item.id };
        })
    );
}
