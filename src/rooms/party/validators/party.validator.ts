import { z } from "zod";
import { PartyLootMode } from "@/modules/party/schemas/party.schema.js";

export const PartyInviteSchema = z.object({ playerName: z.string().trim().min(1).max(32) });
export const PartyTargetSchema = z.object({ playerId: z.string().min(1).max(64) });
export const PartyIdSchema = z.object({ partyRoomId: z.string().min(1).max(64) });
export const PartyLootSchema = z.object({ mode: z.enum(PartyLootMode) });
