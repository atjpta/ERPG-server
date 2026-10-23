import type { Condition, FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";
import type { ConditionContext } from "@/modules/dialogues/types/condition.type.js";

export class ConditionService {
    private isTruthy(value: FlagValue | undefined) {
        return value !== undefined && value !== false && value !== 0 && value !== "";
    }

    evaluateCondition(ctx: ConditionContext, condition: Condition): boolean {
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
                        ? this.isTruthy(ctx.flags[condition.key])
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
    }

    evaluateConditions(
        ctx: ConditionContext,
        conditions: readonly Condition[] | undefined
    ): boolean {
        return (conditions ?? []).every((condition) => this.evaluateCondition(ctx, condition));
    }
}

export const conditionService = new ConditionService();
