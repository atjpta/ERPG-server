import { z } from "zod";

/** `id` = id slot NPC / vật thể trong file map (`MapNpc.id`). */
export const InteractNpcSchema = z.object({ id: z.string().min(1).max(64) });
/** `optionId` rỗng = "Tiếp tục". */
export const DialogueChooseSchema = z.object({ optionId: z.string().max(64) });
export const QuestPreviewSchema = z.object({ questCode: z.string().min(1).max(64) });
export const QuestAbandonSchema = z.object({ questCode: z.string().min(1).max(64) });
