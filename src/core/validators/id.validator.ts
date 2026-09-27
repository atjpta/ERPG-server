import { z } from "zod";

export const IdParamSchema = z.object({
    id: z.uuidv7(),
});

export type IdParam = z.infer<typeof IdParamSchema>;
