import type { NewNpc } from "@/modules/npcs/entities/npc.entity.js";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";

/** NPC mẫu — vị trí đặt trong file map, 1 NPC có thể có mặt ở nhiều map. */
export const NPCS: NewNpc[] = [
    {
        code: "village_chief",
        defaultDialogueCode: "elder_default",
        dialogueRules: [
            // Quest sau xét trước quest trước; trong mỗi quest: trả > đang làm > nhận.
            {
                priority: 50,
                conditions: [
                    { type: "quest_state", questCode: "meet_blacksmith", state: QuestState.READY },
                ],
                dialogueCode: "elder_blacksmith_done",
            },
            {
                priority: 45,
                conditions: [
                    { type: "quest_state", questCode: "meet_blacksmith", state: QuestState.ACTIVE },
                ],
                dialogueCode: "elder_quest_progress",
            },
            {
                priority: 40,
                conditions: [
                    { type: "quest_state", questCode: "slime_hunt", state: QuestState.COMPLETED },
                    {
                        type: "quest_state",
                        questCode: "meet_blacksmith",
                        state: QuestState.NOT_STARTED,
                    },
                ],
                dialogueCode: "elder_blacksmith_offer",
            },
            {
                priority: 30,
                conditions: [
                    { type: "quest_state", questCode: "slime_hunt", state: QuestState.READY },
                ],
                dialogueCode: "elder_slime_done",
            },
            {
                priority: 20,
                conditions: [
                    { type: "quest_state", questCode: "slime_hunt", state: QuestState.ACTIVE },
                ],
                dialogueCode: "elder_quest_progress",
            },
            {
                priority: 10,
                conditions: [
                    { type: "quest_state", questCode: "slime_hunt", state: QuestState.NOT_STARTED },
                ],
                dialogueCode: "elder_slime_offer",
            },
        ],
    },
    {
        code: "blacksmith",
        defaultDialogueCode: "blacksmith_default",
        functions: [
            { id: "enhance", type: NpcFunctionType.ENHANCE, config: {} },
            { id: "refine", type: NpcFunctionType.REFINE, config: {} },
        ],
    },
    // ---- Greenfield Village --------------------------------------------------------------------------
    {
        code: "guild_officer",
        defaultDialogueCode: "guild_officer_default",
        functions: [{ id: "quest_board", type: NpcFunctionType.QUEST_BOARD, config: {} }],
    },
    { code: "swordsman_trainer", defaultDialogueCode: "swordsman_trainer_default" },
    { code: "archer_trainer", defaultDialogueCode: "archer_trainer_default" },
    { code: "cleric_sister", defaultDialogueCode: "cleric_sister_default" },
    { code: "village_priestess", defaultDialogueCode: "village_priestess_default" },
    {
        code: "general_merchant",
        defaultDialogueCode: "general_merchant_default",
        functions: [{ id: "shop", type: NpcFunctionType.SHOP, config: { shop: "general_store" } }],
    },
    { code: "innkeeper", defaultDialogueCode: "innkeeper_default" },
    {
        code: "farmer_rowan",
        defaultDialogueCode: "rowan_default",
    },
    {
        code: "hunter_garrick",
        defaultDialogueCode: "garrick_default",
        dialogueRules: [
            {
                priority: 30,
                conditions: [
                    { type: "quest_state", questCode: "garrick_hunt", state: QuestState.READY },
                ],
                dialogueCode: "garrick_done",
            },
            {
                priority: 20,
                conditions: [
                    { type: "quest_state", questCode: "garrick_hunt", state: QuestState.ACTIVE },
                ],
                dialogueCode: "garrick_progress",
            },
            {
                priority: 10,
                conditions: [
                    {
                        type: "quest_state",
                        questCode: "garrick_hunt",
                        state: QuestState.NOT_STARTED,
                    },
                    { type: "level_min", value: 1 },
                ],
                dialogueCode: "garrick_offer",
            },
        ],
    },
    { code: "guard_captain", defaultDialogueCode: "guard_captain_default" },
    { code: "herbalist", defaultDialogueCode: "herbalist_default" },
];
