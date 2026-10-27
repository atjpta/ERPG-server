import { z } from "zod";

/** Giới hạn `quantity` thật (mỗi lần chế tối đa bao nhiêu) lấy từ master data `crafting_config`; ở đây chỉ chặn payload vô lý. */
export const CraftSchema = z
    .object({
        recipeCode: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(1000).default(1),
    })
    .strict();
export type CraftBody = z.infer<typeof CraftSchema>;
