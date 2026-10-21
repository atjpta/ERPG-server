import type { FlagValue } from "@/modules/dialogues/schemas/condition.schema.js";

const UNLOCK_PREFIX = "unlock.";

export class UnlockService {
    /** Flag ghi vào `player_states.flags` khi quest mở khoá 1 chức năng; điều kiện `flag` trong data dùng key này. */
    unlockFlagKey(feature: string) {
        return `${UNLOCK_PREFIX}${feature}`;
    }

    /** Danh sách chức năng đã mở khoá của player (sắp xếp để ổn định). */
    unlockedFeatures(flags: Record<string, FlagValue>): string[] {
        return Object.entries(flags)
            .filter(([key, value]) => key.startsWith(UNLOCK_PREFIX) && Boolean(value))
            .map(([key]) => key.slice(UNLOCK_PREFIX.length))
            .sort();
    }
}

export const unlockService = new UnlockService();
