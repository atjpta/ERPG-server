import { z } from "zod";
import { playerService } from "@/modules/player/services/player.service.js";

/**
 * Chữ (kể cả tiếng Việt có dấu), số và `_`. Độ dài theo master data `player_config` (nameMinLength /
 * nameMaxLength) được kiểm trong PlayerService — ở đây chỉ chặn trần cứng.
 */
const PlayerNameSchema = z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(playerService.namePattern, "Tên chỉ gồm chữ, số và _");

export const UserRenamePlayerSchema = z.object({ name: PlayerNameSchema });
export type UserRenamePlayerBody = z.infer<typeof UserRenamePlayerSchema>;

export const UserCreatePlayerSchema = z.object({
    name: PlayerNameSchema,
    /** Class khởi đầu (tier 1): swordsman / archer / cleric. */
    classCode: z.string().min(1),
});
export type UserCreatePlayerBody = z.infer<typeof UserCreatePlayerSchema>;
