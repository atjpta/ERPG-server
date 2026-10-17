import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";

const UNLOCK_PREFIX = "unlock.";

/** Flag ghi vào `player_states.flags` khi quest mở khoá 1 chức năng; điều kiện `flag` trong data dùng key này. */
export const unlockFlagKey = (feature: string) => `${UNLOCK_PREFIX}${feature}`;

/** Danh sách chức năng đã mở khoá của player (sắp xếp để ổn định). */
export const unlockedFeatures = (flags: Record<string, FlagValue>): string[] =>
    Object.entries(flags)
        .filter(([key, value]) => key.startsWith(UNLOCK_PREFIX) && Boolean(value))
        .map(([key]) => key.slice(UNLOCK_PREFIX.length))
        .sort();
