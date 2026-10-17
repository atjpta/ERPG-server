import { z } from "zod";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";

/** Client identity persisted with an authenticated account session. */
export const ClientInfoSchema = z.object({
    platform: z.enum(ClientPlatform),
    clientVersion: z.string().min(1).max(32),
    device: z.string().max(255).optional(),
});

export type ClientInfo = z.infer<typeof ClientInfoSchema>;
