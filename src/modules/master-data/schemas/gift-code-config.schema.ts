import { z } from "zod";

/** Master data `gift_code_config`. */
export const GiftCodeConfigSchema = z.object({
    /** Mỗi nhân vật nhập tối đa `limit` lần / `windowSeconds` giây (tính cả lần sai, để chống dò mã). */
    redeemRateLimit: z.object({
        limit: z.number().int().positive(),
        windowSeconds: z.number().int().positive(),
    }),
});
export type GiftCodeConfig = z.infer<typeof GiftCodeConfigSchema>;
