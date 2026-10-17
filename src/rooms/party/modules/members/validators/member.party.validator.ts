import { z } from "zod";

export const PartyInviteSchema = z.object({
    playerName: z.string().trim().min(1).max(32),
    /** Chủ chấp nhận lời xin vào của người đó: lời mời tự được nhận. */
    request: z.boolean().optional(),
});
export const PartyTargetSchema = z.object({ playerId: z.string().min(1).max(64) });
