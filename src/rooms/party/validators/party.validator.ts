import { z } from "zod";

export const PartyInviteSchema = z.object({ playerName: z.string().trim().min(1).max(32) });
export const PartyTargetSchema = z.object({ playerId: z.string().min(1).max(64) });
export const PartyIdSchema = z.object({ partyRoomId: z.string().min(1).max(64) });
