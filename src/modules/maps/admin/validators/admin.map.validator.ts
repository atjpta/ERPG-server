import { z } from "zod";
import { PaginationSchema } from "@/core/validators/pagination.validator.js";
import { MapStatus, MapType } from "@/modules/maps/enums/map.enum.js";

export const AdminListMapsQuerySchema = PaginationSchema.extend({
    type: z.enum(MapType).optional(),
    status: z.enum(MapStatus).optional(),
});
export type AdminListMapsQuery = z.infer<typeof AdminListMapsQuerySchema>;

export const AdminCreateMapSchema = z.object({
    code: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_-]+$/),
    name: z.string().min(1).max(64),
    type: z.enum(MapType).optional(),
    status: z.enum(MapStatus).optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tileSize: z.number().int().positive().optional(),
    spawnX: z.number().min(0),
    spawnY: z.number().min(0),
    maxPlayersPerChannel: z.number().int().positive().optional(),
    pvpEnabled: z.boolean().optional(),
});
export type AdminCreateMapBody = z.infer<typeof AdminCreateMapSchema>;

export const AdminUpdateMapSchema = AdminCreateMapSchema.omit({ code: true }).partial();
export type AdminUpdateMapBody = z.infer<typeof AdminUpdateMapSchema>;
