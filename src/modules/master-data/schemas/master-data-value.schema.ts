import { z } from "zod";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";

/** Bật `singleSessionPerUser` để mỗi lần login mới tự revoke các session cũ (chặn đăng nhập nhiều máy). */
export const AuthSessionConfigSchema = z.object({
    singleSessionPerUser: z.boolean(),
});

export const PlayerConfigSchema = z.object({
    /** Map xuất hiện của player mới tạo (spawn tại `spawnX/spawnY` của map). */
    startMapCode: z.string().min(1),
    /** Số ô của từng túi inventory. */
    inventorySize: z.record(z.enum(ItemType), z.number().int().positive()),
    /** Còn ≤ số ô trống này sau khi nhận item → báo client túi sắp đầy. */
    inventoryNearlyFullThreshold: z.number().int().nonnegative(),
});

/**
 * Bảng exp lên level: `expToNextLevel[i]` = exp cần tích luỹ ở level `i + 1` để lên `i + 2`
 * (player_states.exp tính trong level hiện tại). Level `maxLevel` không lên nữa.
 */
export const LevelConfigSchema = z
    .object({
        maxLevel: z.number().int().min(1),
        expToNextLevel: z.array(z.number().int().positive()),
    })
    .refine((config) => config.expToNextLevel.length === config.maxLevel - 1, {
        message: "expToNextLevel must have maxLevel - 1 entries",
        path: ["expToNextLevel"],
    });

/** Nguồn sự thật duy nhất cho cấu trúc `value` theo từng key — admin update được validate qua đây. */
export const MasterDataValueSchemas = {
    [MasterDataKey.AUTH_SESSION_CONFIG]: AuthSessionConfigSchema,
    [MasterDataKey.PLAYER_CONFIG]: PlayerConfigSchema,
    [MasterDataKey.LEVEL_CONFIG]: LevelConfigSchema,
} satisfies Record<MasterDataKey, z.ZodType>;

export type AuthSessionConfigValue = z.infer<typeof AuthSessionConfigSchema>;
export type PlayerConfigValue = z.infer<typeof PlayerConfigSchema>;
export type LevelConfigValue = z.infer<typeof LevelConfigSchema>;

export type MasterDataValueMap = {
    [K in MasterDataKey]: z.infer<(typeof MasterDataValueSchemas)[K]>;
};
export type MasterDataValue = MasterDataValueMap[MasterDataKey];
