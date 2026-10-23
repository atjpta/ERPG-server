import type { ItemRewardMessage } from "@/modules/rewards/interfaces/reward.message.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

export interface CurrencyBalanceMessage {
    balance: number;
    totalEarned: number;
    totalSpent: number;
}

/** Ví theo CurrencyCode. */
export interface WalletMessage {
    gold: CurrencyBalanceMessage;
    gem: CurrencyBalanceMessage;
}

export interface CurrencyRewardMessage {
    code: CurrencyCode;
    amount: number;
}

export interface RewardMessage {
    exp: number;
    currency: CurrencyRewardMessage[];
    /** Item rơi ra (trước khi xếp túi — túi đầy thì có thêm message `inventoryFull`). */
    items: ItemRewardMessage[];
    /** Level sau khi cộng exp. */
    level: number;
    /** Số level vừa lên (0 = không lên). */
    levelsGained: number;
}
