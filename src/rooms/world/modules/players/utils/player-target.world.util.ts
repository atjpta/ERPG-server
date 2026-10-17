import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { resolvePlayerTargetRule } from "@/modules/master-data/schemas/player-target-config.schema.js";

/**
 * Tầm chọn / quay mặt về target của player — mọi số nằm ở master data `player_target_config`
 * (theo class). Khớp WorldMovementStep.cs bên client (cùng công thức, config qua skills.json).
 */
const config = () => masterDataCacheService.get(MasterDataKey.PLAYER_TARGET_CONFIG);

/** Target đã lock bị mất khi xa hơn mức này. */
export const getKeepTargetRange = () => config().keepTargetRange;

/** Lệch tối thiểu (ô) theo mỗi trục để còn tự đi về phía target. */
export const getApproachDeadzone = () => config().approachDeadzone;

/** Không lock: tự chọn monster gần nhất trong `castRange` của skill sắp xài + margin của class, không vượt tầm giữ. */
export function getAutoTargetRange(classCode: string, castRange: number) {
    const current = config();
    const rule = resolvePlayerTargetRule(current, classCode);
    return Math.min(current.keepTargetRange, castRange + rule.autoTargetMargin);
}

/** Quay mặt về target khi nó trong tầm này: `max(minFaceRange, castRange + faceTargetMargin)` của class. */
export function getFaceTargetRange(classCode: string, castRange: number) {
    const rule = resolvePlayerTargetRule(config(), classCode);
    return Math.max(rule.minFaceRange, castRange + rule.faceTargetMargin);
}
