import { z } from "zod";
import { PLAYER_NAME_PATTERN } from "@/modules/player/utils/player-name.util.js";

/**
 * Chữ (kể cả tiếng Việt có dấu), số và `_`. Độ dài theo master data `player_config` (nameMinLength /
 * nameMaxLength) được kiểm trong PlayerService — ở đây chỉ chặn trần cứng.
 */
const PlayerNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(PLAYER_NAME_PATTERN, "Tên chỉ gồm chữ, số và _");

export const RenamePlayerSchema = z.object({ name: PlayerNameSchema });
export type RenamePlayerBody = z.infer<typeof RenamePlayerSchema>;

export const CreatePlayerSchema = z.object({
    name: PlayerNameSchema,
    /** Class khởi đầu (tier 1): guardian / swordman / archer / mage. */
    classCode: z.string().min(1),
});
export type CreatePlayerBody = z.infer<typeof CreatePlayerSchema>;
