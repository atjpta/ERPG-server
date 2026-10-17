import { z } from "zod";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";

export const UserClientVersionQuerySchema = z.object({
    platform: z.enum(ClientPlatform),
    version: z.string().min(1).max(32),
});
export type UserClientVersionQuery = z.infer<typeof UserClientVersionQuerySchema>;
