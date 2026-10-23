import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";

/** Sự kiện gameplay có thể đẩy tiến độ quest. */
export interface QuestEvent {
    type:
        | QuestObjectiveType.KILL
        | QuestObjectiveType.TALK
        | QuestObjectiveType.INTERACT
        | QuestObjectiveType.CLEAR_DUNGEON;
    targetCode: string;
    amount?: number;
}
