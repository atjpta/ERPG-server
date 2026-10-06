import { z } from "zod";
import {
    EquipmentDisassembleConfigSchema,
    EquipmentDropConfigSchema,
    EquipmentEnhanceConfigSchema,
    EquipmentRefineConfigSchema,
    EquipmentSetConfigSchema,
    EquipmentStatConfigSchema,
} from "@/modules/equipment/schemas/equipment-config.schema.js";
import { ItemType } from "@/modules/items/enums/item.enum.js";
import { MonsterLevelConfigSchema } from "@/modules/monsters/schemas/monster-level-config.schema.js";
import { MonsterScaleConfigSchema } from "@/modules/monsters/schemas/monster-scale-config.schema.js";
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
    /** Số nhân vật tối đa mỗi tài khoản (mỗi server). */
    maxCharacters: z.number().int().min(1).default(4),
    /** Độ dài tên nhân vật (tính theo ký tự). */
    nameMinLength: z.number().int().min(1).default(3),
    nameMaxLength: z.number().int().min(1).max(32).default(16),
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
    [MasterDataKey.EQUIPMENT_STAT_CONFIG]: EquipmentStatConfigSchema,
    [MasterDataKey.EQUIPMENT_SET_CONFIG]: EquipmentSetConfigSchema,
    [MasterDataKey.EQUIPMENT_ENHANCE_CONFIG]: EquipmentEnhanceConfigSchema,
    [MasterDataKey.EQUIPMENT_REFINE_CONFIG]: EquipmentRefineConfigSchema,
    [MasterDataKey.EQUIPMENT_DISASSEMBLE_CONFIG]: EquipmentDisassembleConfigSchema,
    [MasterDataKey.EQUIPMENT_DROP_CONFIG]: EquipmentDropConfigSchema,
    [MasterDataKey.MONSTER_SCALE_CONFIG]: MonsterScaleConfigSchema,
    [MasterDataKey.MONSTER_LEVEL_CONFIG]: MonsterLevelConfigSchema,
} satisfies Record<MasterDataKey, z.ZodType>;

export type AuthSessionConfigValue = z.infer<typeof AuthSessionConfigSchema>;
export type PlayerConfigValue = z.infer<typeof PlayerConfigSchema>;
export type LevelConfigValue = z.infer<typeof LevelConfigSchema>;

export type MasterDataValueMap = {
    [K in MasterDataKey]: z.infer<(typeof MasterDataValueSchemas)[K]>;
};
export type MasterDataValue = MasterDataValueMap[MasterDataKey];
