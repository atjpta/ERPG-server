import { z } from "zod";

export const PartyDeclineSchema = z.object({ partyRoomId: z.string().min(1).max(64) });
