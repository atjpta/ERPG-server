import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import type { QuestState } from "@/modules/quests/enums/quest.enum.js";

/** Những gì điều kiện cần biết về player — world service dựng từ PlayerWorldState. */
export interface ConditionContext {
    level: number;
    classCode: string;
    baseClassCode: string;
    mapCode: string;
    flags: Readonly<Record<string, FlagValue>>;
    questState: (questCode: string) => QuestState;
    itemCount: (itemCode: string) => number;
    currency: (code: string) => number;
}
