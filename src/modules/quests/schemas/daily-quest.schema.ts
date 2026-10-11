import { z } from "zod";
import { QuestObjectiveSchema } from "@/modules/quests/schemas/quest.schema.js";
import { RewardSpecSchema } from "@/modules/rewards/schemas/reward-spec.schema.js";

/** Code cố định của 3 quest hằng ngày — thoại / rule tham chiếu theo code, nội dung sinh theo level. */
export const DAILY_QUEST_CODES = ["daily_kill", "daily_dungeon", "daily_collect"] as const;
export type DailyQuestCode = (typeof DAILY_QUEST_CODES)[number];

/** 1 quest hằng ngày đã sinh cho player (lưu trong `player_states.daily_quests`). */
export const DailyQuestDefSchema = z.object({
    code: z.enum(DAILY_QUEST_CODES),
    /** Level của player lúc sinh — dùng tính thưởng. */
    level: z.number().int().positive(),
    objective: QuestObjectiveSchema,
    rewards: RewardSpecSchema,
});
export type DailyQuestDef = z.infer<typeof DailyQuestDefSchema>;

export const PlayerDailyQuestsSchema = z.object({
    /** Ngày (theo giờ reset) mà bộ quest này thuộc về, dạng `yyyy-MM-dd`. */
    date: z.string(),
    quests: z.array(DailyQuestDefSchema),
});
export type PlayerDailyQuests = z.infer<typeof PlayerDailyQuestsSchema>;

const killOption = z.object({ monsterCode: z.string().min(1), count: z.number().int().positive() });
const collectOption = z.object({ itemCode: z.string().min(1), count: z.number().int().positive() });
const dungeonOption = z.object({ mapCode: z.string().min(1) });
const rewardRule = z.object({
    expPerLevel: z.number().int().nonnegative(),
    goldPerLevel: z.number().int().nonnegative(),
    items: z
        .array(z.object({ itemCode: z.string().min(1), quantity: z.number().int().positive() }))
        .default([]),
});

/** Master data `daily_quest_config`: bảng lựa chọn theo bậc level + thưởng theo level. */
export const DailyQuestConfigSchema = z.object({
    /** Giờ reset trong ngày (0 = nửa đêm theo `TIME_ZONE`). */
    resetHour: z.number().int().min(0).max(23),
    /** Bậc level; player dùng bậc có `minLevel` lớn nhất ≤ level của mình. */
    tiers: z
        .array(
            z.object({
                minLevel: z.number().int().positive(),
                kill: z.array(killOption).min(1),
                dungeon: z.array(dungeonOption).min(1),
                collect: z.array(collectOption).min(1),
            })
        )
        .min(1),
    rewards: z.object({ kill: rewardRule, dungeon: rewardRule, collect: rewardRule }),
});
export type DailyQuestConfig = z.infer<typeof DailyQuestConfigSchema>;
