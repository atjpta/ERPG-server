import { z } from "zod";
import { CurrencyRewardSchema } from "@/modules/rewards/schemas/currency-reward.schema.js";

/** Phần thưởng cố định ghi trong data (quest, vật thể thu thập...) — item tham chiếu theo code. */
export const RewardSpecSchema = z.object({
    exp: z.number().int().nonnegative().default(0),
    currency: z.array(CurrencyRewardSchema).default([]),
    items: z
        .array(z.object({ itemCode: z.string().min(1), quantity: z.number().int().positive() }))
        .default([]),
});
export type RewardSpec = z.infer<typeof RewardSpecSchema>;
