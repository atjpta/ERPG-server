import type { NewNpc } from "@/modules/npcs/entities/npc.entity.js";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { NpcFunctionType } from "@/modules/npcs/schemas/npc-function.schema.js";

/** NPC mẫu — vị trí đặt trong file map, 1 NPC có thể có mặt ở nhiều map. */
export const NPCS: NewNpc[] = [
    {
        code: "elder",
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
            { id: "disassemble", type: NpcFunctionType.DISASSEMBLE, config: {} },
        ],
    },
];
