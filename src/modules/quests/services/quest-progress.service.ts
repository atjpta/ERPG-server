import { DateTime } from "luxon";
import { conditionService } from "@/modules/dialogues/services/condition.service.js";
import type { ConditionContext } from "@/modules/dialogues/types/condition.type.js";
import { QuestObjectiveType, QuestRepeat, QuestState } from "@/modules/quests/enums/quest.enum.js";
import type { Quest } from "@/modules/quests/entities/quest.entity.js";
import type { PlayerQuestEntry, PlayerQuests } from "@/modules/quests/schemas/quest.schema.js";
import type { QuestEvent } from "@/modules/quests/types/quest-progress.type.js";

type QuestRules = Pick<Quest, "objectives">;

export class QuestProgressService {
    /** Tiến độ hiện tại của 1 mục tiêu (đã kẹp theo `count`). */
    objectiveCurrent(
        objective: Quest["objectives"][number],
        entry: PlayerQuestEntry,
        itemCount: (itemCode: string) => number
    ): number {
        const raw =
            objective.type === QuestObjectiveType.COLLECT
                ? itemCount(objective.targetCode)
                : (entry.progress[objective.id] ?? 0);
        return Math.min(objective.count, raw);
    }

    isQuestDone(
        quest: QuestRules,
        entry: PlayerQuestEntry,
        itemCount: (itemCode: string) => number
    ): boolean {
        return quest.objectives.every(
            (objective) => this.objectiveCurrent(objective, entry, itemCount) >= objective.count
        );
    }

    questStateOf(
        quest: QuestRules,
        entry: PlayerQuestEntry | undefined,
        itemCount: (itemCode: string) => number
    ): QuestState {
        if (!entry) return QuestState.NOT_STARTED;
        if (entry.status === "completed") return QuestState.COMPLETED;
        return this.isQuestDone(quest, entry, itemCount) ? QuestState.READY : QuestState.ACTIVE;
    }

    /** Quest đã hoàn thành có làm lại được hôm nay không. */
    private isRepeatable(quest: Pick<Quest, "repeat">, entry: PlayerQuestEntry, now: DateTime) {
        if (quest.repeat === QuestRepeat.INFINITE) return true;
        if (quest.repeat !== QuestRepeat.DAILY || !entry.completedAt) return false;
        return DateTime.fromISO(entry.completedAt).startOf("day") < now.startOf("day");
    }

    /** Player có nhận được quest này ngay bây giờ không (chưa làm / làm lại được, đủ điều kiện). */
    canAcceptQuest(
        quest: Quest,
        entry: PlayerQuestEntry | undefined,
        ctx: ConditionContext,
        now: DateTime
    ): boolean {
        if (!quest.enabled) return false;
        if (entry) {
            if (entry.status === "active" || !this.isRepeatable(quest, entry, now)) return false;
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
            quest.prerequisiteQuestCodes.some(
                (code) => ctx.questState(code) !== QuestState.COMPLETED
            )
        ) {
            return false;
        }
        return conditionService.evaluateConditions(ctx, quest.conditions);
    }

    newQuestEntry(now: DateTime): PlayerQuestEntry {
        return {
            status: "active",
            progress: {},
            acceptedAt: now.toISO()!,
        };
    }

    /** Cộng tiến độ cho mọi quest đang làm có mục tiêu khớp; trả code các quest vừa đổi. */
    applyQuestEvent(
        quests: PlayerQuests,
        definitions: (code: string) => QuestRules | undefined,
        event: QuestEvent
    ): string[] {
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
                entry.progress[objective.id] = Math.min(
                    objective.count,
                    current + (event.amount ?? 1)
                );
                touched = true;
            }
            if (touched) changed.push(code);
        }
        return changed;
    }
}

export const questProgressService = new QuestProgressService();
