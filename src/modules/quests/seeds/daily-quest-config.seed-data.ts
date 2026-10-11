import type { DailyQuestConfig } from "@/modules/quests/schemas/daily-quest.schema.js";

const dust = (count: number) => [
    { itemCode: "dust_weapon", count },
    { itemCode: "dust_armor", count },
    { itemCode: "dust_accessory", count },
];

/**
 * Mặc định master data `daily_quest_config`. Ba bậc khớp 3 vùng: plains (lv1+), forest (lv10+),
 * evergrowth (lv20+); hầm ngục mỗi bậc là hầm ngục có thể vào ở level đó.
 */
export const DEFAULT_DAILY_QUEST_CONFIG: DailyQuestConfig = {
    resetHour: 0,
    tiers: [
        {
            minLevel: 1,
            kill: [
                { monsterCode: "slime", count: 10 },
                { monsterCode: "bat", count: 10 },
            ],
            dungeon: [{ mapCode: "slime_hollow" }],
            collect: dust(3),
        },
        {
            minLevel: 10,
            kill: [
                { monsterCode: "werewolf", count: 12 },
                { monsterCode: "bat", count: 15 },
            ],
            dungeon: [{ mapCode: "werewolf_den" }],
            collect: [...dust(4), { itemCode: "enhance_stone_2", count: 3 }],
        },
        {
            minLevel: 20,
            kill: [
                { monsterCode: "werewolf", count: 15 },
                { monsterCode: "werebear", count: 12 },
            ],
            dungeon: [{ mapCode: "sanctuary_of_life" }],
            collect: [...dust(5), { itemCode: "enhance_stone_3", count: 3 }],
        },
    ],
    rewards: {
        kill: { expPerLevel: 40, goldPerLevel: 10, items: [] },
        dungeon: {
            expPerLevel: 90,
            goldPerLevel: 25,
            items: [{ itemCode: "hp_potion_small", quantity: 3 }],
        },
        collect: { expPerLevel: 30, goldPerLevel: 8, items: [] },
    },
};
