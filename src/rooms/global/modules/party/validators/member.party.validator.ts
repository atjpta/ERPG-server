import { z } from "zod";

export const PartyInviteSchema = z.object({
    playerName: z.string().trim().min(1).max(32),
    /** Chủ chấp nhận lời xin vào của người đó: lời mời tự được nhận. */
    request: z.boolean().optional(),
});
export const PartyTargetSchema = z.object({ playerId: z.string().min(1).max(64) });
/** Trả lời một lời mời cụ thể (nhận / từ chối). */
export const PartyInviteReplySchema = z.object({ partyId: z.string().min(1).max(64) });
