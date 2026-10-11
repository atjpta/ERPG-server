import type { NewDialogue } from "@/modules/dialogues/entities/dialogue.entity.js";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { DAILY_QUEST_CODES } from "@/modules/quests/schemas/daily-quest.schema.js";
import { STORY_DIALOGUES } from "@/modules/quests/seeds/quest-content.js";

/**
 * Thoại mẫu. Text không nằm ở đây: client tra locale theo `dialogue.{code}.{nodeId}.text` và
 * `dialogue.{code}.{nodeId}.opt.{optionId}`.
 */
export const DIALOGUES: NewDialogue[] = [
    {
        code: "elder_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "blacksmith_default",
        nodes: [
            {
                id: "start",
                actions: [{ type: "talk" }],
                options: [
                    {
                        id: "enhance",
                        hideIfFail: false,
                        actions: [{ type: "open_function", function: "enhance" }],
                    },
                    { id: "bye", hideIfFail: false },
                ],
            },
        ],
    },
    {
        code: "notice_board",
        nodes: [{ id: "start", next: "page_2" }, { id: "page_2" }],
    },
    // ---- Greenfield Village ------------------------------------------------------------------------
    {
        code: "guild_officer_default",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "board",
                        hideIfFail: false,
                        actions: [{ type: "open_function", function: "quest_board" }],
                    },
                    { id: "bye", hideIfFail: false },
                ],
            },
        ],
    },
    {
        code: "swordsman_trainer_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "archer_trainer_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "cleric_trainer_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "guard_captain_default",
        nodes: [
            {
                id: "start",
                actions: [{ type: "talk" }],
                options: [{ id: "bye", hideIfFail: false }],
            },
        ],
    },
    {
        code: "herbalist_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "rowan_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "garrick_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "village_priestess_default",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "bless",
                        hideIfFail: false,
                        next: "blessed",
                        actions: [{ type: "heal" }],
                    },
                    { id: "bye", hideIfFail: false },
                ],
            },
            { id: "blessed" },
        ],
    },
    {
        code: "general_merchant_default",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "shop",
                        hideIfFail: false,
                        actions: [{ type: "open_function", function: "shop" }],
                    },
                    { id: "bye", hideIfFail: false },
                ],
            },
        ],
    },
    {
        code: "innkeeper_default",
        nodes: [
            {
                id: "start",
                options: [
                    { id: "rest", hideIfFail: false, next: "rested", actions: [{ type: "heal" }] },
                    { id: "rumor", hideIfFail: false, next: "rumor" },
                    { id: "bye", hideIfFail: false },
                ],
            },
            { id: "rested" },
            { id: "rumor" },
        ],
    },
    {
        code: "gate_locked",
        nodes: [{ id: "start" }],
    },
    {
        code: "researcher_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "alchemist_default",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "refine",
                        hideIfFail: true,
                        conditions: [{ type: "flag", key: "unlock.alchemy" }],
                        actions: [{ type: "open_function", function: "refine" }],
                    },
                    { id: "bye", hideIfFail: false },
                ],
            },
        ],
    },
    {
        code: "daily_claim",
        nodes: [
            {
                id: "start",
                options: [
                    ...DAILY_QUEST_CODES.map((questCode) => ({
                        id: `claim_${questCode.replace("daily_", "")}`,
                        hideIfFail: true,
                        next: "thanks",
                        conditions: [
                            {
                                type: "quest_state" as const,
                                questCode,
                                state: QuestState.READY,
                            },
                        ],
                        actions: [{ type: "complete_quest" as const, questCode }],
                    })),
                    { id: "bye", hideIfFail: false },
                ],
            },
            { id: "thanks" },
        ],
    },
    ...STORY_DIALOGUES,
];
