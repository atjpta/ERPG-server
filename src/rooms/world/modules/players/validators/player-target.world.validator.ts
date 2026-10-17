import { z } from "zod";

export const PlayerTargetSchema = z.object({ playerId: z.string().min(1).max(64) }).strict();
