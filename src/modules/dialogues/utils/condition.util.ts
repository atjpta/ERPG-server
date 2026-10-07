import type { Condition, FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
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

const isTruthy = (value: FlagValue | undefined) =>
    value !== undefined && value !== false && value !== 0 && value !== "";

export const evaluateCondition = (ctx: ConditionContext, condition: Condition): boolean => {
    let result: boolean;
    switch (condition.type) {
        case "level_min":
            result = ctx.level >= condition.value;
            break;
        case "level_max":
            result = ctx.level <= condition.value;
            break;
        case "class_in":
            result =
                condition.codes.includes(ctx.classCode) ||
                condition.codes.includes(ctx.baseClassCode);
            break;
        case "quest_state":
            result = ctx.questState(condition.questCode) === condition.state;
            break;
        case "has_item":
            result = ctx.itemCount(condition.itemCode) >= condition.quantity;
            break;
        case "flag":
            result =
                condition.value === undefined
                    ? isTruthy(ctx.flags[condition.key])
                    : ctx.flags[condition.key] === condition.value;
            break;
        case "map_is":
            result = ctx.mapCode === condition.mapCode;
            break;
        case "currency_min":
            result = ctx.currency(condition.currency) >= condition.amount;
            break;
    }
    return condition.negate ? !result : result;
};

export const evaluateConditions = (
    ctx: ConditionContext,
    conditions: readonly Condition[] | undefined
): boolean => (conditions ?? []).every((condition) => evaluateCondition(ctx, condition));
