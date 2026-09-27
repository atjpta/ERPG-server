import { z } from "zod";

export const LocalizedStringSchema = z.object({
    vi: z.string().min(1),
    en: z.string().min(1),
});
