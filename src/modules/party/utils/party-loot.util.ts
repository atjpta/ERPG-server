import { PartyLootMode } from "@/modules/party/schemas/party.schema.js";
import { splitPartyExp } from "@/modules/party/utils/party-exp.util.js";
import type { Reward } from "@/modules/rewards/types/reward.type.js";

export interface ShareParticipant {
    id: string;
    level: number;
}

export interface ShareOptions {
    expBonusPerExtraMember: number;
    /** 0 = không giới hạn. */
    maxLevelGap: number;
    shareGold: boolean;
    lootMode: PartyLootMode;
    /** Con trỏ luân phiên (round robin) — trả về giá trị mới trong `nextCursor`. */
    cursor: number;
    rng?: () => number;
}

export interface ShareResult {
    /** Phần thưởng của từng người đủ điều kiện (người không đủ điều kiện không có mặt). */
    rewards: Map<string, Reward>;
    nextCursor: number;
}

/** Người chơi có nằm trong khoảng chênh level cho phép so với quái không (`maxLevelGap` 0 = luôn đúng). */
export const withinLevelGap = (level: number, monsterLevel: number, maxLevelGap: number) =>
    maxLevelGap === 0 || Math.abs(level - monsterLevel) <= maxLevelGap;

/**
 * Chia thưởng hạ quái cho party. Đủ điều kiện = người kết liễu + thành viên chênh level với quái không
 * quá `maxLevelGap`. Chỉ 1 người đủ điều kiện → người đó nhận hết. Ngược lại:
 * - exp chia đều có bonus theo số người (`splitPartyExp`);
 * - vàng chia đều (phần dư về người kết liễu) nếu `shareGold`, không thì người kết liễu giữ hết;
 * - mỗi item (cả stack) giao cho một người theo `lootMode`.
 */
export function shareKillReward(
    reward: Reward,
    killerId: string,
    participants: readonly ShareParticipant[],
    monsterLevel: number,
    options: ShareOptions
): ShareResult {
    const eligible = participants.filter(
        (p) => p.id === killerId || withinLevelGap(p.level, monsterLevel, options.maxLevelGap)
    );
    if (eligible.length <= 1) {
        return { rewards: new Map([[killerId, reward]]), nextCursor: options.cursor };
    }

    const exp = splitPartyExp(reward.exp, eligible.length, options.expBonusPerExtraMember);
    const rewards = new Map<string, Reward>(
        eligible.map((p): [string, Reward] => [
            p.id,
            { currency: [], items: [], source: reward.source, exp },
        ])
    );
    const killerReward = rewards.get(killerId)!;

    for (const currency of reward.currency) {
        if (!options.shareGold) {
            killerReward.currency.push(currency);
            continue;
        }
        const share = Math.floor(currency.amount / eligible.length);
        const remainder = currency.amount - share * eligible.length;
        for (const p of eligible) {
            const amount = share + (p.id === killerId ? remainder : 0);
            if (amount > 0) rewards.get(p.id)!.currency.push({ code: currency.code, amount });
        }
    }

    const rng = options.rng ?? Math.random;
    let cursor = options.cursor;
    for (const item of reward.items) {
        let recipient = killerId;
        if (options.lootMode === PartyLootMode.ROUND_ROBIN) {
            recipient = eligible[cursor % eligible.length].id;
            cursor++;
        } else if (options.lootMode === PartyLootMode.RANDOM) {
            recipient = eligible[Math.floor(rng() * eligible.length)].id;
        }
        rewards.get(recipient)!.items.push(item);
    }
    return { rewards, nextCursor: cursor };
}
