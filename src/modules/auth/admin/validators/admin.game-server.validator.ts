import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { GameServerStatus } from "@/modules/auth/enums/game-server.enum.js";

export const AdminListGameServersQuerySchema = PaginationSchema.extend({
    status: z.enum(GameServerStatus).optional(),
});
export type AdminListGameServersQuery = z.infer<typeof AdminListGameServersQuerySchema>;

export const AdminCreateGameServerSchema = z.object({
    code: z
        .string()
        .min(1)
        .max(32)
        .regex(/^[a-z0-9_-]+$/),
    name: z.string().min(1).max(64),
    status: z.enum(GameServerStatus).optional(),
    maxPlayers: z.number().int().positive().optional(),
    sortOrder: z.number().int().optional(),
});
export type AdminCreateGameServerBody = z.infer<typeof AdminCreateGameServerSchema>;

export const AdminUpdateGameServerSchema = AdminCreateGameServerSchema.omit({
    code: true,
}).partial();
export type AdminUpdateGameServerBody = z.infer<typeof AdminUpdateGameServerSchema>;
