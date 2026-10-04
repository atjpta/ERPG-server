import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { ATTRIBUTE_POINTS_PER_LEVEL } from "@/modules/player/utils/player-stat.util.js";

/** Điểm kỹ năng nhận mỗi lần lên level. */
export const SKILL_POINTS_PER_LEVEL = 1;

export interface LevelProgress {
    level: number;
    /** Exp tích luỹ trong level hiện tại. */
    exp: number;
}

export interface ExpGainResult extends LevelProgress {
    levelsGained: number;
}

/**
 * Cộng exp và lên level liên tiếp khi đủ (dư exp chuyển sang level sau). `expToNext(level)` trả
 * `undefined` ở level tối đa — exp vẫn cộng nhưng dừng ở đó.
 */
export function gainExp(
    progress: LevelProgress,
    amount: number,
    expToNext: (level: number) => number | undefined
): ExpGainResult {
    let { level, exp } = progress;
    exp += Math.max(0, amount);
    let levelsGained = 0;
    for (
        let need = expToNext(level);
        need !== undefined && need > 0 && exp >= need;
        need = expToNext(level)
    ) {
        exp -= need;
        level++;
        levelsGained++;
    }
    return { level, exp, levelsGained };
}

/** Điểm attribute / kỹ năng nhận được khi lên `levelsGained` level. */
export const levelUpPoints = (levelsGained: number) => ({
    attributePoints: levelsGained * ATTRIBUTE_POINTS_PER_LEVEL,
    skillPoints: levelsGained * SKILL_POINTS_PER_LEVEL,
});

/** Cộng tiền thưởng vào ví (balance + totalEarned), trả ví mới. */
export function creditWallet(wallet: Wallet, rewards: readonly CurrencyReward[]): Wallet {
    const next = structuredClone(wallet);
    for (const { code, amount } of rewards) {
        if (amount <= 0) continue;
        const balance = (next[code] ??= { balance: 0, totalEarned: 0, totalSpent: 0 });
        balance.balance += amount;
        balance.totalEarned += amount;
    }
    return next;
}
