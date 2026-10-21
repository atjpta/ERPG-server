import {
    type ConditionContext,
    conditionService,
} from "@/modules/dialogues/services/condition.service.js";
import type { DialogueRule } from "@/modules/dialogues/schemas/dialogue.schema.js";

interface RuleSource {
    defaultDialogueCode: string | null;
    dialogueRules: readonly DialogueRule[];
}

export class DialogueRuleService {
    /**
     * Chọn thoại cho NPC theo hoàn cảnh: rule của map này (hoặc mọi map) thoả điều kiện, `priority` cao
     * nhất thắng (bằng nhau thì rule khai báo trước); không rule nào khớp → thoại mặc định.
     */
    selectDialogueCode(npc: RuleSource, ctx: ConditionContext): string | undefined {
        const winner = npc.dialogueRules
            .filter((rule) => !rule.mapCode || rule.mapCode === ctx.mapCode)
            .filter((rule) => conditionService.evaluateConditions(ctx, rule.conditions))
            .reduce<DialogueRule | undefined>(
                (best, rule) => (!best || rule.priority > best.priority ? rule : best),
                undefined
            );
        return winner?.dialogueCode ?? npc.defaultDialogueCode ?? undefined;
    }
}

export const dialogueRuleService = new DialogueRuleService();
