import { z } from "zod";

const nonNegative = z.number().nonnegative();

/**
 * Tầm chọn / quay mặt về target, tính theo `castRange` của skill sắp xài (hiện là đòn đánh thường kế
 * tiếp). Đơn vị: ô.
 */
export const PlayerTargetRuleSchema = z.object({
    /** Không lock: tự chọn monster gần nhất trong `castRange + autoTargetMargin`. */
    autoTargetMargin: nonNegative,
    /** Quay mặt về target khi nó trong `max(minFaceRange, castRange + faceTargetMargin)`. */
    faceTargetMargin: nonNegative,
    minFaceRange: nonNegative,
});

/** Auto battle của client (nút Auto / phím R): nó chỉ sinh input giống người chơi, nên các số này chỉ client đọc. */
export const AutoBattleConfigSchema = z.object({
    /** Quái xa hơn mức này thì auto bỏ qua. */
    range: z.number().positive(),
    /** Quái đang đuổi mà xa hơn mức này thì bị bỏ. */
    loseRange: z.number().positive(),
    /** Gần hơn mức này thì dừng đi và bấm đánh (cận chiến). */
    minSwingRange: nonNegative,
    /** Đánh xa: bắt đầu bấm đánh khi còn cách `castRange - rangedSwingMargin`. */
    rangedSwingMargin: nonNegative,
    /** Xin server lock target khi cách `max(minLockRange, swingRange + lockMargin)` (tối đa `keepTargetRange`). */
    minLockRange: nonNegative,
    lockMargin: nonNegative,
});

/**
 * Chọn / giữ / quay mặt về target của player và auto battle — server và client Unity dùng chung (client đọc qua
 * `skills.json`, `yarn config:export`). Class nào không khai báo trong `classes` (hoặc thiếu field) dùng `default`.
 */
export const PlayerTargetConfigSchema = z.object({
    /** Target đã lock bị mất khi xa hơn mức này. */
    keepTargetRange: z.number().positive(),
    /** Lệch tối thiểu (ô) theo mỗi trục để còn tự đi về phía target khi áp sát. */
    approachDeadzone: nonNegative,
    default: PlayerTargetRuleSchema,
    classes: z.record(z.string(), PlayerTargetRuleSchema.partial()).default({}),
    autoBattle: AutoBattleConfigSchema,
});

export type PlayerTargetRule = z.infer<typeof PlayerTargetRuleSchema>;
export type PlayerTargetConfig = z.infer<typeof PlayerTargetConfigSchema>;

/** Luật của class (thiếu field thì lấy từ `default`). */
export const resolvePlayerTargetRule = (
    config: PlayerTargetConfig,
    classCode: string
): PlayerTargetRule => ({ ...config.default, ...config.classes[classCode] });

export const DEFAULT_PLAYER_TARGET_CONFIG: PlayerTargetConfig = {
    keepTargetRange: 6,
    approachDeadzone: 1,
    default: { autoTargetMargin: 1, faceTargetMargin: 0, minFaceRange: 2 },
    classes: {
        swordsman: { autoTargetMargin: 1, faceTargetMargin: 2, minFaceRange: 2 },
        archer: { autoTargetMargin: 1, faceTargetMargin: 2, minFaceRange: 2 },
        cleric: { autoTargetMargin: 1, faceTargetMargin: 2, minFaceRange: 2 },
    },
    autoBattle: {
        range: 5,
        loseRange: 8,
        minSwingRange: 1,
        rangedSwingMargin: 0.5,
        minLockRange: 4,
        lockMargin: 0.5,
    },
};
