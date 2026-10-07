import { z } from "zod";
import { QuestState } from "@/modules/quests/enums/quest.enum.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

export const FlagValueSchema = z.union([z.boolean(), z.number(), z.string()]);
export type FlagValue = z.infer<typeof FlagValueSchema>;

const negate = { negate: z.boolean().optional() };

/** Điều kiện kiểm tra trên player — dùng cho rule chọn thoại, option, vật thể tương tác, quest. */
export const ConditionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("level_min"), value: z.number().int().positive(), ...negate }),
    z.object({ type: z.literal("level_max"), value: z.number().int().positive(), ...negate }),
    /** Khớp class hiện tại hoặc class tier 1 gốc của nó. */
    z.object({ type: z.literal("class_in"), codes: z.array(z.string()).min(1), ...negate }),
    z.object({
        type: z.literal("quest_state"),
        questCode: z.string(),
        state: z.enum(QuestState),
        ...negate,
    }),
    z.object({
        type: z.literal("has_item"),
        itemCode: z.string(),
        quantity: z.number().int().positive().default(1),
        ...negate,
    }),
    /** `value` bỏ trống = flag tồn tại và khác false/0/"". */
    z.object({
        type: z.literal("flag"),
        key: z.string(),
        value: FlagValueSchema.optional(),
        ...negate,
    }),
    z.object({ type: z.literal("map_is"), mapCode: z.string(), ...negate }),
    z.object({
        type: z.literal("currency_min"),
        currency: z.enum(CurrencyCode),
        amount: z.number().int().nonnegative(),
        ...negate,
    }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** Hiệu ứng chạy khi vào node thoại hoặc chọn option. */
export const ActionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("start_quest"), questCode: z.string() }),
    z.object({ type: z.literal("complete_quest"), questCode: z.string() }),
    z.object({
        type: z.literal("give_item"),
        itemCode: z.string(),
        quantity: z.number().int().positive().default(1),
    }),
    z.object({
        type: z.literal("take_item"),
        itemCode: z.string(),
        quantity: z.number().int().positive().default(1),
    }),
    z.object({
        type: z.literal("give_currency"),
        currency: z.enum(CurrencyCode),
        amount: z.number().int().positive(),
    }),
    z.object({
        type: z.literal("take_currency"),
        currency: z.enum(CurrencyCode),
        amount: z.number().int().positive(),
    }),
    z.object({
        type: z.literal("set_flag"),
        key: z.string(),
        value: FlagValueSchema.default(true),
    }),
    /** Hồi đầy HP/MP. */
    z.object({ type: z.literal("heal") }),
    z.object({ type: z.literal("teleport"), mapCode: z.string(), spawnId: z.string() }),
    /** Mở UI chức năng của NPC (shop, cường hoá...) — chức năng khai báo trong `npcs.functions`. */
    z.object({ type: z.literal("open_function"), function: z.string() }),
    /** Tính là đã nói chuyện với NPC này (mục tiêu quest `talk`). */
    z.object({ type: z.literal("talk") }),
]);
export type Action = z.infer<typeof ActionSchema>;
