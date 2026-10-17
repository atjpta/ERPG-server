import { DialogueCode } from "@/modules/dialogues/enums/dialogue-code.enum.js";
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
        code: DialogueCode.ELDER_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.BLACKSMITH_DEFAULT,
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
        code: DialogueCode.NOTICE_BOARD,
        nodes: [{ id: "start", next: "page_2" }, { id: "page_2" }],
    },
    // ---- Greenfield Village ------------------------------------------------------------------------
    {
        code: DialogueCode.GUILD_OFFICER_DEFAULT,
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
        code: DialogueCode.SWORDSMAN_TRAINER_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.ARCHER_TRAINER_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.CLERIC_TRAINER_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.GUARD_CAPTAIN_DEFAULT,
        nodes: [
            {
                id: "start",
                actions: [{ type: "talk" }],
                options: [{ id: "bye", hideIfFail: false }],
            },
        ],
    },
    {
        code: DialogueCode.HERBALIST_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.ROWAN_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.GARRICK_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.VILLAGE_PRIESTESS_DEFAULT,
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
        code: DialogueCode.GENERAL_MERCHANT_DEFAULT,
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
        code: DialogueCode.INNKEEPER_DEFAULT,
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
        code: DialogueCode.GATE_LOCKED,
        nodes: [{ id: "start" }],
    },
    {
        code: DialogueCode.RESEARCHER_DEFAULT,
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: DialogueCode.ALCHEMIST_DEFAULT,
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
        code: DialogueCode.DAILY_CLAIM,
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
