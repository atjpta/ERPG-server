import { PartyLootMode } from "@/rooms/global/modules/party/types/party-member.type.js";
import { z } from "zod";
export const PartyLootSchema = z.object({ mode: z.enum(PartyLootMode) });
