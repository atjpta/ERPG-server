import { z } from "zod";
import { CurrencyRewardSchema } from "@/modules/rewards/schemas/currency-reward.schema.js";

const LocaleSchema = z.string().trim().min(1).max(16);

export const MailListSchema = z.object({ locale: LocaleSchema.optional() });
export const MailIdSchema = z.object({ mailId: z.string().min(1).max(64) });

/** Giới hạn ở đây chỉ chặn payload khổng lồ; giới hạn thật (độ dài, số món) lấy từ master data `mail_config`. */
export const MailSendSchema = z.object({
    targetName: z.string().trim().min(1).max(32),
    subject: z.string().max(500).default(""),
    body: z.string().max(5000).default(""),
    items: z
        .array(
            z.object({
                instanceId: z.string().min(1).max(64),
                quantity: z.number().int().positive(),
            })
        )
        .max(50)
        .default([]),
    currency: z.array(CurrencyRewardSchema).max(10).default([]),
    cod: CurrencyRewardSchema.optional(),
});
export type MailSendBody = z.infer<typeof MailSendSchema>;
