import type { ItemSource } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";

export interface CurrencyReward {
    code: CurrencyCode;
    amount: number;
}

export interface ItemReward {
    itemId: string;
    quantity: number;
    /** Trang bị: chỉ số đã roll của món đó (quantity = 1). */
    metadata?: ItemEquipmentInstanceMetadata;
}

/** Phần thưởng đã roll xong (từ drop, quest, gacha…) — sẵn sàng cộng vào player. */
export interface Reward {
    currency: CurrencyReward[];
    items: ItemReward[];
    source: ItemSource;
    exp: number;
}
