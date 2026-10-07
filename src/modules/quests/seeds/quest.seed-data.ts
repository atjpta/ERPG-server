import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { NewQuest } from "@/modules/quests/entities/quest.entity.js";
import { QuestObjectiveType, QuestRepeat } from "@/modules/quests/enums/quest.enum.js";

/** Quest mẫu: chuỗi săn slime → gặp thợ rèn. Text tra locale theo `quest.{code}.*`. */
export const QUESTS: NewQuest[] = [
    {
        code: "slime_hunt",
        requiredLevel: 1,
        giverNpcCode: "elder",
        turnInNpcCode: "elder",
        repeat: QuestRepeat.NONE,
        objectives: [
            { id: "kill_slime", type: QuestObjectiveType.KILL, targetCode: "slime", count: 3 },
        ],
        rewards: {
            exp: 100,
            currency: [{ code: CurrencyCode.GOLD, amount: 50 }],
            items: [{ itemCode: "hp_potion_small", quantity: 3 }],
        },
    },
    {
        code: "meet_blacksmith",
        requiredLevel: 1,
        prerequisiteQuestCodes: ["slime_hunt"],
        giverNpcCode: "elder",
        turnInNpcCode: "elder",
        objectives: [
            { id: "talk_smith", type: QuestObjectiveType.TALK, targetCode: "blacksmith", count: 1 },
        ],
        rewards: { exp: 50, currency: [], items: [] },
    },
];
