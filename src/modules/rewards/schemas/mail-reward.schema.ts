import { z } from "zod";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { ItemEquipmentInstanceMetadataSchema } from "@/modules/items/schemas/item-metadata.schema.js";
import { CurrencyRewardSchema } from "@/modules/rewards/schemas/currency-reward.schema.js";

/**
 * Cột `reward` của mail: đúng hình `Reward` (reward.type.ts) mà quái rớt, quest, dungeon... dùng, để mọi nguồn
 * thưởng gửi được thành thư và thư người chơi đính kèm dùng chung một định dạng. Validate khi ghi / đọc DB.
 */
export const MailRewardSchema = z.object({
    currency: z.array(CurrencyRewardSchema),
    items: z.array(
        z.object({
            itemId: z.uuid(),
            quantity: z.number().int().positive(),
            /** Trang bị: chỉ số đã roll của món đó (quantity = 1). */
            metadata: ItemEquipmentInstanceMetadataSchema.optional(),
        })
    ),
    source: z.enum(ItemSource),
    /** Exp chưa nhận được qua thư (global chưa có RPC cộng exp): luôn 0. */
    exp: z.number().int().nonnegative(),
});
export type MailReward = z.infer<typeof MailRewardSchema>;

/** Giá COD của thư: người nhận phải trả mới lấy được `reward`. */
export const MailCodSchema = CurrencyRewardSchema;
export type MailCod = z.infer<typeof MailCodSchema>;
