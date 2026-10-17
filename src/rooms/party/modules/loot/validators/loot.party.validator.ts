import { PartyLootMode } from "@/rooms/party/schemas/party.schema.js";
import { z } from "zod";
export const PartyLootSchema = z.object({ mode: z.enum(PartyLootMode) });
