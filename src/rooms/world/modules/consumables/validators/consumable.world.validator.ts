import { z } from "zod";

/** Dùng 1 bình (consumable) trong túi. */
export const UseItemSchema = z.object({ instanceId: z.uuid() }).strict();
