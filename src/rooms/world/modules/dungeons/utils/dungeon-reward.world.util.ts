import type {
    CurrencyRewardMessage,
    DungeonRewardMemberMessage,
    ItemRewardMessage,
    RewardMessage,
} from "@/rooms/world/types/world-message.type.js";

/** Cộng dồn những gì 1 người nhận được trong lần đi dungeon (để hiện bảng thưởng sau khi clear). */
export interface DungeonRewardTally {
    playerId: string;
    name: string;
    classCode: string;
    level: number;
    exp: number;
    currency: Map<string, number>;
    items: Map<string, ItemRewardMessage>;
}

export function newTally(player: {
    id: string;
    name: string;
    classCode: string;
    level: number;
}): DungeonRewardTally {
    return {
        playerId: player.id,
        name: player.name,
        classCode: player.classCode,
        level: player.level,
        exp: 0,
        currency: new Map(),
        items: new Map(),
    };
}

/** Ghi 1 lần nhận thưởng vào tally; trang bị (có chỉ số roll riêng) không gộp, vật phẩm thường gộp theo itemId. */
export function recordReward(
    tally: DungeonRewardTally,
    reward: RewardMessage,
    level: number
): void {
    tally.level = level;
    tally.exp += reward.exp;
    for (const currency of reward.currency) {
        tally.currency.set(
            currency.code,
            (tally.currency.get(currency.code) ?? 0) + currency.amount
        );
    }
    for (const item of reward.items) {
        if (item.metadata) {
            tally.items.set(`${item.itemId}#${tally.items.size}`, { ...item });
            continue;
        }
        const have = tally.items.get(item.itemId);
        if (have) have.quantity += item.quantity;
        else tally.items.set(item.itemId, { ...item });
    }
}

export function toMemberMessage(tally: DungeonRewardTally): DungeonRewardMemberMessage {
    const currency: CurrencyRewardMessage[] = [...tally.currency].map(([code, amount]) => ({
        code: code as CurrencyRewardMessage["code"],
        amount,
    }));
    return {
        playerId: tally.playerId,
        name: tally.name,
        classCode: tally.classCode,
        level: tally.level,
        exp: tally.exp,
        currency: currency.filter((entry) => entry.amount > 0),
        items: [...tally.items.values()],
    };
}
