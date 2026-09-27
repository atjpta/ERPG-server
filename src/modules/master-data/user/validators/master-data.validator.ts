import { z } from "zod";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";

export const ClientVersionQuerySchema = z.object({
    platform: z.enum(ClientPlatform),
    version: z.string().min(1).max(32),
});
export type ClientVersionQuery = z.infer<typeof ClientVersionQuerySchema>;
