import { z } from "zod";
import { StatKey } from "@/modules/player/enums/stat.enum.js";

const points = z.number().int().nonnegative().optional();

/** Payload của message `allocateAttributes`: số điểm muốn cộng vào từng attribute (thiếu = 0). */
export const AllocateAttributesSchema = z
    .object({
        [StatKey.STRENGTH]: points,
        [StatKey.DEXTERITY]: points,
        [StatKey.INTELLIGENCE]: points,
        [StatKey.VITALITY]: points,
        [StatKey.LUCK]: points,
    })
    .strict();

export type AllocateAttributesPayload = z.infer<typeof AllocateAttributesSchema>;
