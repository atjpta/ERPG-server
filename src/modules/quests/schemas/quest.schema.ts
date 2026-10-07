import { z } from "zod";
import { ConditionSchema } from "@/modules/dialogues/schemas/condition.schema.js";
import { QuestObjectiveType, QuestRepeat } from "@/modules/quests/enums/quest.enum.js";
import { RewardSpecSchema } from "@/modules/rewards/schemas/reward-spec.schema.js";

const idSchema = z.string().regex(/^[a-z0-9_]+$/);

export const QuestObjectiveSchema = z.object({
    /** Id trong quest — key của tiến độ; text mục tiêu: `quest.{code}.obj.{id}`. */
    id: idSchema,
    type: z.enum(QuestObjectiveType),
    /** Monster code / item code / NPC code / id vật thể, theo `type`. */
    targetCode: z.string().min(1),
    count: z.number().int().positive().default(1),
});
export type QuestObjective = z.infer<typeof QuestObjectiveSchema>;

export const QuestObjectivesSchema = z
    .array(QuestObjectiveSchema)
    .min(1)
    .refine((objectives) => new Set(objectives.map((o) => o.id)).size === objectives.length, {
        message: "duplicate objective id",
    });

export const QuestDefinitionSchema = z.object({
    requiredLevel: z.number().int().positive().default(1),
    prerequisiteQuestCodes: z.array(z.string()).default([]),
    /** Rỗng = mọi class. */
    classCodes: z.array(z.string()).default([]),
    giverNpcCode: z.string(),
    turnInNpcCode: z.string(),
    repeat: z.enum(QuestRepeat).default(QuestRepeat.NONE),
    objectives: QuestObjectivesSchema,
    rewards: RewardSpecSchema.default({ exp: 0, currency: [], items: [] }),
    /** Điều kiện thêm để được nhận quest. */
    conditions: z.array(ConditionSchema).default([]),
});
export type QuestDefinition = z.infer<typeof QuestDefinitionSchema>;

/** Quest của 1 player — lưu trong `player_states.quests`, key = quest code. */
export const PlayerQuestEntrySchema = z.object({
    status: z.enum(["active", "completed"]),
    /** objective id → số đã đạt (mục tiêu `collect` tính theo túi, không lưu ở đây). */
    progress: z.record(z.string(), z.number()).default({}),
    acceptedAt: z.string(),
    completedAt: z.string().optional(),
});
export type PlayerQuestEntry = z.infer<typeof PlayerQuestEntrySchema>;
export type PlayerQuests = Record<string, PlayerQuestEntry>;
