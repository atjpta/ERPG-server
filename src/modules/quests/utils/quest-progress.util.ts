import { DateTime } from "luxon";
import {
    evaluateConditions,
    type ConditionContext,
} from "@/modules/dialogues/utils/condition.util.js";
import { QuestObjectiveType, QuestRepeat, QuestState } from "@/modules/quests/enums/quest.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import type { PlayerQuestEntry, PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";

type QuestRules = Pick<Quest, "objectives">;

/** Sự kiện gameplay có thể đẩy tiến độ quest. */
export interface QuestEvent {
    type: QuestObjectiveType.KILL | QuestObjectiveType.TALK | QuestObjectiveType.INTERACT;
    targetCode: string;
    amount?: number;
}

/** Tiến độ hiện tại của 1 mục tiêu (đã kẹp theo `count`). */
export const objectiveCurrent = (
    objective: Quest["objectives"][number],
    entry: PlayerQuestEntry,
    itemCount: (itemCode: string) => number
): number => {
    const raw =
        objective.type === QuestObjectiveType.COLLECT
            ? itemCount(objective.targetCode)
            : (entry.progress[objective.id] ?? 0);
    return Math.min(objective.count, raw);
};

export const isQuestDone = (
    quest: QuestRules,
    entry: PlayerQuestEntry,
    itemCount: (itemCode: string) => number
): boolean =>
    quest.objectives.every(
        (objective) => objectiveCurrent(objective, entry, itemCount) >= objective.count
    );

export const questStateOf = (
    quest: QuestRules,
    entry: PlayerQuestEntry | undefined,
    itemCount: (itemCode: string) => number
): QuestState => {
    if (!entry) return QuestState.NOT_STARTED;
    if (entry.status === "completed") return QuestState.COMPLETED;
    return isQuestDone(quest, entry, itemCount) ? QuestState.READY : QuestState.ACTIVE;
};

/** Quest đã hoàn thành có làm lại được hôm nay không. */
const isRepeatable = (quest: Pick<Quest, "repeat">, entry: PlayerQuestEntry, now: DateTime) => {
    if (quest.repeat === QuestRepeat.INFINITE) return true;
    if (quest.repeat !== QuestRepeat.DAILY || !entry.completedAt) return false;
    return DateTime.fromISO(entry.completedAt).startOf("day") < now.startOf("day");
};

/** Player có nhận được quest này ngay bây giờ không (chưa làm / làm lại được, đủ điều kiện). */
export const canAcceptQuest = (
    quest: Quest,
    entry: PlayerQuestEntry | undefined,
    ctx: ConditionContext,
    now: DateTime
): boolean => {
    if (!quest.enabled) return false;
    if (entry) {
        if (entry.status === "active" || !isRepeatable(quest, entry, now)) return false;
    }
    if (ctx.level < quest.requiredLevel) return false;
    if (
        quest.classCodes.length > 0 &&
        !quest.classCodes.includes(ctx.classCode) &&
        !quest.classCodes.includes(ctx.baseClassCode)
    ) {
        return false;
    }
    if (
        quest.prerequisiteQuestCodes.some((code) => ctx.questState(code) !== QuestState.COMPLETED)
    ) {
        return false;
    }
    return evaluateConditions(ctx, quest.conditions);
};

export const newQuestEntry = (now: DateTime): PlayerQuestEntry => ({
    status: "active",
    progress: {},
    acceptedAt: now.toISO()!,
});

/** Cộng tiến độ cho mọi quest đang làm có mục tiêu khớp; trả code các quest vừa đổi. */
export const applyQuestEvent = (
    quests: PlayerQuests,
    definitions: (code: string) => QuestRules | undefined,
    event: QuestEvent
): string[] => {
    const changed: string[] = [];
    for (const [code, entry] of Object.entries(quests)) {
        if (entry.status !== "active") continue;
        const quest = definitions(code);
        if (!quest) continue;
        let touched = false;
        for (const objective of quest.objectives) {
            if (objective.type !== event.type || objective.targetCode !== event.targetCode)
                continue;
            const current = entry.progress[objective.id] ?? 0;
            if (current >= objective.count) continue;
            entry.progress[objective.id] = Math.min(objective.count, current + (event.amount ?? 1));
            touched = true;
        }
        if (touched) changed.push(code);
    }
    return changed;
};
