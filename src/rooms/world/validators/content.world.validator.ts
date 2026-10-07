import { z } from "zod";

export const InteractSchema = z.object({ id: z.string().min(1).max(64) });
export const InteractNpcSchema = z.object({ npcCode: z.string().min(1).max(64) });
/** `optionId` rỗng = "Tiếp tục". */
export const DialogueChooseSchema = z.object({ optionId: z.string().max(64) });
export const QuestAbandonSchema = z.object({ questCode: z.string().min(1).max(64) });
