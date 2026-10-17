import { z } from "zod";

export const TeleportToSchema = z.object({ mapCode: z.string().min(1).max(64) });
