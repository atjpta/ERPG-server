import { integer, jsonb, pgEnum, pgTable, text } from "drizzle-orm/pg-core";
import { baseWithCodeColumns } from "@/core/entities/base.entity.js";
import type { Condition } from "@/modules/dialogues/schemas/condition.schema.js";
import { QuestRepeat } from "@/modules/quests/enums/quest.enum.js";
import type { QuestObjective } from "@/modules/quests/schemas/quest.schema.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";

export const questRepeatEnum = pgEnum("quest_repeat", QuestRepeat);

/**
 * Định nghĩa quest. Tên / mô tả / mục tiêu hiển thị tra locale theo `quest.{code}.name|desc` và
 * `quest.{code}.obj.{objectiveId}`; tiến độ từng player nằm ở `player_states.quests`.
 */
export const Quests = pgTable("quests", {
    ...baseWithCodeColumns(),
    requiredLevel: integer("required_level").notNull().default(1),
    prerequisiteQuestCodes: jsonb("prerequisite_quest_codes")
        .$type<string[]>()
        .notNull()
        .default([]),
    classCodes: jsonb("class_codes").$type<string[]>().notNull().default([]),
    giverNpcCode: text("giver_npc_code").notNull(),
    turnInNpcCode: text("turn_in_npc_code").notNull(),
    repeat: questRepeatEnum("repeat").notNull().default(QuestRepeat.NONE),
    objectives: jsonb("objectives").$type<QuestObjective[]>().notNull().default([]),
    rewards: jsonb("rewards").$type<RewardSpec>().notNull(),
    conditions: jsonb("conditions").$type<Condition[]>().notNull().default([]),
});

export type Quest = typeof Quests.$inferSelect;
export type NewQuest = typeof Quests.$inferInsert;
