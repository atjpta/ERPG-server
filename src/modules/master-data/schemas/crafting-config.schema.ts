import { z } from "zod";

/** Master data `crafting_config`. */
export const CraftingConfigSchema = z.object({
    /** Số cái tối đa mỗi lần chế (`craft { quantity }`). */
    maxQuantity: z.number().int().positive(),
});
export type CraftingConfig = z.infer<typeof CraftingConfigSchema>;
