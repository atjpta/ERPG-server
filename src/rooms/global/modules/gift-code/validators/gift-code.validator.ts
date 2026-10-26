import { z } from "zod";

/** Giới hạn ở đây chỉ chặn payload khổng lồ; code sai định dạng cũng chỉ là `GIFT_CODE_NOT_FOUND`. */
export const GiftCodeRedeemSchema = z.object({ code: z.string().trim().min(1).max(64) });
