import type { ItemRarity, ItemSource } from "@/modules/items/enums/item.enum.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

export interface CurrencyReward {
    code: CurrencyCode;
    amount: number;
}

export interface ItemReward {
    itemId: string;
    quantity: number;
    rarity: ItemRarity;
    metadata?: Record<string, unknown>;
}

/** Phần thưởng đã roll xong (từ drop, quest, gacha…) — sẵn sàng cộng vào player. */
export interface Reward {
    currency: CurrencyReward[];
    items: ItemReward[];
    source: ItemSource;
    exp: number;
}
