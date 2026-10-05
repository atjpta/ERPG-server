import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";
import { ATTRIBUTE_POINTS_PER_LEVEL } from "@/modules/player/utils/player-stat.util.js";
import {
    ATTRIBUTE_KEYS,
    type AttributeKey,
    type Attributes,
} from "@/modules/player/schemas/stat.schema.js";

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

export interface AttributeAllocationResult {
    allocatedAttributes: Attributes;
    attributePoints: number;
}

/**
 * Cộng điểm tiềm năng vào attribute: mỗi giá trị là số nguyên ≥ 0, tổng > 0 và không vượt số điểm
 * đang có. Trả lỗi (string) thay vì throw để room trả về cho client.
 */
export function allocateAttributePoints(
    allocated: Attributes,
    available: number,
    request: Partial<Record<AttributeKey, number>>
): AttributeAllocationResult | string {
    let total = 0;
    for (const key of ATTRIBUTE_KEYS) {
        const value = request[key] ?? 0;
        if (!Number.isInteger(value) || value < 0) return `Invalid points for ${key}`;
        total += value;
    }
    if (total <= 0) return "No attribute points to allocate";
    if (total > available) return "Not enough attribute points";

    const allocatedAttributes = { ...allocated };
    for (const key of ATTRIBUTE_KEYS) allocatedAttributes[key] += request[key] ?? 0;
    return { allocatedAttributes, attributePoints: available - total };
}

/** Trừ tiền (balance − amount, totalSpent + amount); không đủ tiền → `undefined`. */
export function debitWallet(wallet: Wallet, costs: readonly CurrencyReward[]): Wallet | undefined {
    const next = structuredClone(wallet);
    for (const { code, amount } of costs) {
        if (amount <= 0) continue;
        const balance = next[code];
        if (!balance || balance.balance < amount) return undefined;
        balance.balance -= amount;
        balance.totalSpent += amount;
    }
    return next;
}
