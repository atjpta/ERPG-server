import { QuestCode } from "@/modules/quests/enums/quest-code.enum.js";
import type { NewDialogue } from "@/modules/dialogues/entities/dialogue.entity.js";
import type { Condition } from "@/modules/dialogues/schemas/condition.schema.js";
import type { DialogueRule } from "@/modules/dialogues/schemas/dialogue.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { NewQuest } from "@/modules/quests/entities/quest.entity.js";
import {
    QuestCategory,
    QuestObjectiveType,
    QuestState,
} from "@/modules/quests/enums/quest.enum.js";
import type { QuestObjective } from "@/modules/quests/schemas/quest.schema.js";

/**
 * Quest cốt truyện + phụ, viết gọn một chỗ: từ đây sinh ra quest, thoại (offer / progress / done) và
 * rule chọn thoại của NPC — thêm quest = thêm 1 dòng, không phải viết tay 3 dialogue + 3 rule.
 * Text tra locale: `quest.{code}.name|desc|obj.{id}`, `dialogue.{code}_{offer|progress|done}.*`.
 */
interface QuestContent {
    code: string;
    category: QuestCategory;
    chapter?: number;
    requiredLevel: number;
    prerequisite?: string;
    giverNpcCode: string;
    turnInNpcCode: string;
    objectives: QuestObjective[];
    exp: number;
    gold: number;
    potions?: number;
    /** Chức năng mở khoá khi hoàn thành. */
    unlock?: string[];
}

const kill = (id: string, targetCode: string, count: number): QuestObjective => ({
    id,
    type: QuestObjectiveType.KILL,
    targetCode,
    count,
});
const talk = (id: string, targetCode: string): QuestObjective => ({
    id,
    type: QuestObjectiveType.TALK,
    targetCode,
    count: 1,
});
const clearDungeon = (id: string, targetCode: string): QuestObjective => ({
    id,
    type: QuestObjectiveType.CLEAR_DUNGEON,
    targetCode,
    count: 1,
});

/** Thứ tự trong mảng = thứ tự cốt truyện (`sortOrder`). */
const CONTENT: QuestContent[] = [
    // ---- Hero (đỏ): cốt truyện, mở khoá chức năng ---------------------------------------------------
    {
        code: QuestCode.ADVENTURER_REGISTRATION,
        category: QuestCategory.HERO,
        chapter: 1,
        requiredLevel: 1,
        giverNpcCode: "village_chief",
        turnInNpcCode: "guild_officer",
        objectives: [talk("talk_guild", "guild_officer")],
        exp: 60,
        gold: 50,
        potions: 3,
        unlock: ["guild", "quest_board", "daily_quest"],
    },
    {
        code: QuestCode.FIRST_HUNT,
        category: QuestCategory.HERO,
        chapter: 1,
        requiredLevel: 1,
        prerequisite: "adventurer_registration",
        giverNpcCode: "guild_officer",
        turnInNpcCode: "guild_officer",
        objectives: [kill("kill_slime", "slime", 5), kill("kill_bat", "bat", 3)],
        exp: 150,
        gold: 80,
        potions: 3,
        unlock: ["dungeon"],
    },
    {
        code: QuestCode.STRANGE_MANA,
        category: QuestCategory.HERO,
        chapter: 2,
        requiredLevel: 3,
        prerequisite: "first_hunt",
        giverNpcCode: "researcher",
        turnInNpcCode: "researcher",
        objectives: [kill("kill_slime", "slime", 8), kill("kill_bat", "bat", 6)],
        exp: 400,
        gold: 150,
        potions: 3,
        unlock: ["alchemy"],
    },
    {
        code: QuestCode.SHADOWS_OF_THE_FOREST,
        category: QuestCategory.HERO,
        chapter: 3,
        requiredLevel: 10,
        prerequisite: "strange_mana",
        giverNpcCode: "hunter_garrick",
        turnInNpcCode: "hunter_garrick",
        objectives: [kill("kill_werewolf", "werewolf", 8), kill("kill_bat", "bat", 6)],
        exp: 1500,
        gold: 400,
        potions: 5,
    },
    {
        code: QuestCode.WEREWOLF_DEN,
        category: QuestCategory.HERO,
        chapter: 3,
        requiredLevel: 10,
        prerequisite: "shadows_of_the_forest",
        giverNpcCode: "hunter_garrick",
        turnInNpcCode: "hunter_garrick",
        objectives: [clearDungeon("clear_den", "werewolf_den")],
        exp: 2500,
        gold: 800,
        potions: 5,
    },
    {
        code: QuestCode.INTO_THE_EVERGROWTH,
        category: QuestCategory.HERO,
        chapter: 4,
        requiredLevel: 20,
        prerequisite: "werewolf_den",
        giverNpcCode: "guild_officer",
        turnInNpcCode: "guild_officer",
        objectives: [kill("kill_werewolf", "werewolf", 10), kill("kill_werebear", "werebear", 8)],
        exp: 6000,
        gold: 1500,
        potions: 5,
    },
    {
        code: QuestCode.SANCTUARY_OF_LIFE,
        category: QuestCategory.HERO,
        chapter: 4,
        requiredLevel: 20,
        prerequisite: "into_the_evergrowth",
        giverNpcCode: "researcher",
        turnInNpcCode: "researcher",
        objectives: [clearDungeon("clear_sanctuary", "sanctuary_of_life")],
        exp: 9000,
        gold: 2500,
        potions: 5,
    },
    {
        code: QuestCode.ROAD_TO_THE_CITY,
        category: QuestCategory.HERO,
        chapter: 5,
        requiredLevel: 30,
        prerequisite: "sanctuary_of_life",
        giverNpcCode: "village_chief",
        turnInNpcCode: "village_chief",
        objectives: [talk("talk_guard", "guard_captain")],
        exp: 12000,
        gold: 4000,
        potions: 5,
        unlock: ["next_phase"],
    },
    // ---- Side (vàng): nội dung thiết kế sau, đây chỉ là mẫu ------------------------------------------
    {
        code: QuestCode.ROWAN_CROPS,
        category: QuestCategory.SIDE,
        requiredLevel: 1,
        giverNpcCode: "farmer_rowan",
        turnInNpcCode: "farmer_rowan",
        objectives: [kill("kill_slime", "slime", 5)],
        exp: 80,
        gold: 40,
    },
];

const isSelfTalk = (quest: QuestContent) =>
    quest.objectives.every(
        (objective) =>
            objective.type === QuestObjectiveType.TALK &&
            objective.targetCode === quest.turnInNpcCode
    );

export const STORY_QUESTS: NewQuest[] = CONTENT.map((quest, index) => ({
    code: quest.code,
    category: quest.category,
    sortOrder: index + 1,
    chapter: quest.chapter ?? 0,
    unlockFeatures: quest.unlock ?? [],
    requiredLevel: quest.requiredLevel,
    prerequisiteQuestCodes: quest.prerequisite ? [quest.prerequisite] : [],
    giverNpcCode: quest.giverNpcCode,
    turnInNpcCode: quest.turnInNpcCode,
    objectives: quest.objectives,
    rewards: {
        exp: quest.exp,
        currency: [{ code: CurrencyCode.GOLD, amount: quest.gold }],
        items: quest.potions ? [{ itemCode: "hp_potion_small", quantity: quest.potions }] : [],
    },
}));

const offerCode = (code: string) => `${code}_offer`;
const progressCode = (code: string) => `${code}_progress`;
const doneCode = (code: string) => `${code}_done`;

const claimNodes = (questCode: string) => [
    {
        id: "start",
        options: [
            {
                id: "claim",
                hideIfFail: false,
                next: "thanks",
                actions: [{ type: "complete_quest" as const, questCode }],
            },
        ],
    },
    { id: "thanks" },
];

/** Thoại offer / progress / done của mọi quest trong `CONTENT`. */
export const STORY_DIALOGUES: NewDialogue[] = CONTENT.flatMap((quest): NewDialogue[] => [
    {
        code: offerCode(quest.code),
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "accept",
                        hideIfFail: false,
                        next: "accepted",
                        actions: [{ type: "start_quest", questCode: quest.code }],
                    },
                    { id: "decline", hideIfFail: false },
                ],
            },
            { id: "accepted" },
        ],
    },
    // Quest chỉ cần nói chuyện với chính NPC trả quest: vào thoại là xong mục tiêu, trả luôn.
    isSelfTalk(quest)
        ? {
              code: progressCode(quest.code),
              nodes: claimNodes(quest.code).map((node) =>
                  node.id === "start" ? { ...node, actions: [{ type: "talk" as const }] } : node
              ),
          }
        : {
              code: progressCode(quest.code),
              nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
          },
    { code: doneCode(quest.code), nodes: claimNodes(quest.code) },
]);

const questState = (questCode: string, state: QuestState): Condition => ({
    type: "quest_state",
    questCode,
    state,
});

/**
 * Rule chọn thoại của NPC cho mọi quest nó giao / nhận: trả (ready) > đang làm > nhận (offer);
 * cùng loại thì quest sau đứng trước. Offer chỉ hiện khi đã xong quest trước và đủ level.
 */
export const questDialogueRules = (npcCode: string): DialogueRule[] =>
    CONTENT.flatMap((quest, index): DialogueRule[] => {
        const rules: DialogueRule[] = [];
        if (quest.turnInNpcCode === npcCode) {
            rules.push(
                {
                    priority: 3000 + index,
                    conditions: [questState(quest.code, QuestState.READY)],
                    dialogueCode: doneCode(quest.code),
                },
                {
                    priority: 2000 + index,
                    conditions: [questState(quest.code, QuestState.ACTIVE)],
                    dialogueCode: progressCode(quest.code),
                }
            );
        }
        if (quest.giverNpcCode === npcCode) {
            rules.push({
                priority: 1000 + index,
                conditions: [
                    questState(quest.code, QuestState.NOT_STARTED),
                    ...(quest.prerequisite
                        ? [questState(quest.prerequisite, QuestState.COMPLETED)]
                        : []),
                    { type: "level_min", value: quest.requiredLevel },
                ],
                dialogueCode: offerCode(quest.code),
            });
        }
        return rules;
    });
