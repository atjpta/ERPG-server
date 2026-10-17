import { z } from "zod";

export const UserMapCodeParamSchema = z.object({ code: z.string().min(1).max(64) });
