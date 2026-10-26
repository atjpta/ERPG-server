import { z } from "zod";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

/** Một khoản tiền tệ (thưởng, đính kèm thư, giá COD): loại tiền + số lượng nguyên dương. Khớp `CurrencyReward`. */
export const CurrencyRewardSchema = z.object({
    code: z.enum(CurrencyCode),
    amount: z.number().int().positive().max(2_000_000_000), // vừa int32 của client Unity
});
