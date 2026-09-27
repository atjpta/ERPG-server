import { z } from "zod";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";

/** Bật `singleSessionPerUser` để mỗi lần login mới tự revoke các session cũ (chặn đăng nhập nhiều máy). */
export const AuthSessionConfigSchema = z.object({
    singleSessionPerUser: z.boolean(),
});

export const PlayerConfigSchema = z.object({
    /** Map xuất hiện của player mới tạo (spawn tại `spawnX/spawnY` của map). */
    startMapCode: z.string().min(1),
});

/** Nguồn sự thật duy nhất cho cấu trúc `value` theo từng key — admin update được validate qua đây. */
export const MasterDataValueSchemas = {
    [MasterDataKey.AUTH_SESSION_CONFIG]: AuthSessionConfigSchema,
    [MasterDataKey.PLAYER_CONFIG]: PlayerConfigSchema,
} satisfies Record<MasterDataKey, z.ZodType>;

export type AuthSessionConfigValue = z.infer<typeof AuthSessionConfigSchema>;
export type PlayerConfigValue = z.infer<typeof PlayerConfigSchema>;

export type MasterDataValueMap = {
    [K in MasterDataKey]: z.infer<(typeof MasterDataValueSchemas)[K]>;
};
export type MasterDataValue = MasterDataValueMap[MasterDataKey];
