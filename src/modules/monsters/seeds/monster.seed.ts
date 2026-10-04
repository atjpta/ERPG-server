import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { ItemRepo } from "@/modules/items/repositories/item.repository.js";
import { Monsters, type NewMonster } from "@/modules/monsters/entities/monster.entity.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import { MonsterRepo } from "@/modules/monsters/repositories/monster.repository.js";
import {
    MonsterDropsSchema,
    type CurrencyDrop,
} from "@/modules/monsters/schemas/monster-drop.schema.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { toOwnedSkills } from "@/modules/skills/seeds/owned-skills.seed.util.js";

interface ItemDropSeed {
    itemCode: string;
    quantity: number;
    rate: number;
    rarity?: Partial<Record<ItemRarity, number>>;
}

interface MonsterSeedData extends Omit<NewMonster, "skills" | "drops"> {
    /** Theo thứ tự; skill MELEE đầu tiên là đòn đánh thường. */
    skillCodes: string[];
    /** Như cột `drops` nhưng item ghi theo code. */
    drops: { currency: CurrencyDrop[]; items: ItemDropSeed[]; exp: number };
}

/** Chạy sau SkillSeed và ItemSeed (tham chiếu skill/item theo id). */
const MONSTERS: MonsterSeedData[] = [
    {
        code: "orc",
        name: "Orc",
        level: 1,
        attackCooldownMs: 2000,
        hitbox: { width: 0.4, height: 0.5, offsetX: 0, offsetY: 0 },
        collider: { width: 0.4, height: 0.1, offsetX: 0, offsetY: 0 },
        skillCodes: ["orc_slash"],
        type: MonsterType.NORMAL,
        rarity: ItemRarity.COMMON,
        stats: {
            [StatKey.MAX_HP]: 50,
            [StatKey.PHYSICAL_ATTACK]: 5,
            [StatKey.PHYSICAL_DEFENSE]: 0,
            [StatKey.MOVE_SPEED]: 2,
        },
        drops: {
            currency: [{ code: CurrencyCode.GOLD, min: 1, max: 10 }],
            items: [
                // {
                //     itemCode: "wooden_sword",
                //     quantity: 1,
                //     rate: 0.05,
                //     rarity: { [ItemRarity.COMMON]: 0.8, [ItemRarity.RARE]: 0.2 },
                // },
                // { itemCode: "hp_potion_small", quantity: 1, rate: 0.3 },
            ],
            exp: 20,
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
