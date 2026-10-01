import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { Direction } from "@/modules/player/enums/player.enum.js";

export const AdminListPlayersQuerySchema = PaginationSchema.extend({
    serverId: z.uuidv7().optional(),
    userId: z.uuidv7().optional(),
    status: z.enum(PlayerStatus).optional(),
});
export type AdminListPlayersQuery = z.infer<typeof AdminListPlayersQuerySchema>;

/** GM chỉnh player (level/exp/vị trí — vd kéo player bị kẹt map về làng). */
export const AdminUpdatePlayerSchema = z.object({
    name: z.string().trim().min(3).max(16).optional(),
    level: z.number().int().min(1).optional(),
    exp: z.number().int().min(0).optional(),
    hp: z.number().int().min(0).optional(),
    mp: z.number().int().min(0).optional(),
    mapCode: z.string().min(1).optional(),
    x: z.number().min(0).optional(),
    y: z.number().min(0).optional(),
    direction: z.enum(Direction).optional(),
});
export type AdminUpdatePlayerBody = z.infer<typeof AdminUpdatePlayerSchema>;

export const AdminBanPlayerSchema = z.object({
    reason: z.string().max(500).optional(),
});
export type AdminBanPlayerBody = z.infer<typeof AdminBanPlayerSchema>;
