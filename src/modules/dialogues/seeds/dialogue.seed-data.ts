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
];
