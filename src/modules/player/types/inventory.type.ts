import { type ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";

/** Phần thông tin item (catalog) cần để xếp vào túi. */
export interface StackInfo {
    id: string;
    stackable: boolean;
    maxStack: number;
}

export interface AddToInventoryResult {
    added: number;
    /** Số lượng không xếp được vì túi đầy. */
    overflow: number;
}

/** Item không còn chỗ trong túi (bị mất) và các loại túi vừa được cộng — để báo client sau khi lưu xong. */
export interface GrantOutcome {
    lostByType: Map<ItemType, ItemReward[]>;
    touched: Set<ItemType>;
}
