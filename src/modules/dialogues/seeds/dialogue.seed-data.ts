import type { NewDialogue } from "@/modules/dialogues/entities/dialogue.entity.js";

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
        code: "elder_slime_offer",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "accept",
                        hideIfFail: false,
                        next: "accepted",
                        actions: [{ type: "start_quest", questCode: "slime_hunt" }],
                    },
                    { id: "decline", hideIfFail: false, next: "declined" },
                ],
            },
            { id: "accepted" },
            { id: "declined" },
        ],
    },
    {
        code: "elder_quest_progress",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "elder_slime_done",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "claim",
                        hideIfFail: false,
                        next: "thanks",
                        actions: [{ type: "complete_quest", questCode: "slime_hunt" }],
                    },
                ],
            },
            { id: "thanks" },
        ],
    },
    {
        code: "elder_blacksmith_offer",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "accept",
                        hideIfFail: false,
                        next: "accepted",
                        actions: [{ type: "start_quest", questCode: "meet_blacksmith" }],
                    },
                    { id: "decline", hideIfFail: false },
                ],
            },
            { id: "accepted" },
        ],
    },
    {
        code: "elder_blacksmith_done",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "claim",
                        hideIfFail: false,
                        next: "thanks",
                        actions: [{ type: "complete_quest", questCode: "meet_blacksmith" }],
                    },
                ],
            },
            { id: "thanks" },
        ],
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
                    {
                        id: "refine",
                        hideIfFail: false,
                        actions: [{ type: "open_function", function: "refine" }],
                    },
                    {
                        id: "disassemble",
                        hideIfFail: false,
                        actions: [{ type: "open_function", function: "disassemble" }],
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
        code: "cleric_sister_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "guard_captain_default",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
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
        code: "rowan_offer",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "accept",
                        hideIfFail: false,
                        next: "accepted",
                        actions: [{ type: "start_quest", questCode: "rowan_herbs" }],
                    },
                    { id: "decline", hideIfFail: false },
                ],
            },
            { id: "accepted" },
        ],
    },
    {
        code: "rowan_progress",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "rowan_done",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "claim",
                        hideIfFail: false,
                        next: "thanks",
                        actions: [{ type: "complete_quest", questCode: "rowan_herbs" }],
                    },
                ],
            },
            { id: "thanks" },
        ],
    },
    {
        code: "garrick_offer",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "accept",
                        hideIfFail: false,
                        next: "accepted",
                        actions: [{ type: "start_quest", questCode: "garrick_hunt" }],
                    },
                    { id: "decline", hideIfFail: false },
                ],
            },
            { id: "accepted" },
        ],
    },
    {
        code: "garrick_progress",
        nodes: [{ id: "start", options: [{ id: "bye", hideIfFail: false }] }],
    },
    {
        code: "garrick_done",
        nodes: [
            {
                id: "start",
                options: [
                    {
                        id: "claim",
                        hideIfFail: false,
                        next: "thanks",
                        actions: [{ type: "complete_quest", questCode: "garrick_hunt" }],
                    },
                ],
            },
            { id: "thanks" },
        ],
    },
];
