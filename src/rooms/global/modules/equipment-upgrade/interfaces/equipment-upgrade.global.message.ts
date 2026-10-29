import type { ItemRarity } from "@/modules/items/enums/item.enum.js";
import type { EquipmentUpgradeAction } from "@/rooms/global/modules/equipment-upgrade/enums/equipment-upgrade-action.enum.js";
import type {
    EquipmentInstanceMessage,
    StatLineMessage,
} from "@/rooms/global/modules/player-data/interfaces/player-data.global.message.js";

/** Nguyên liệu nhận được (phân rã). */
export interface MaterialAmountMessage {
    itemId: string;
    code: string;
    /** Độ hiếm của nguyên liệu — client tô màu tên theo đó. */
    rarity: ItemRarity;
    quantity: number;
}

export interface EquipmentUpgradeMessage {
    action: EquipmentUpgradeAction;
    /** Roll tỉ lệ thành công (phân rã luôn `true`). */
    success: boolean;
    instanceIds: string[];
    /** Chỉ số của món sau khi cường hoá / tinh hoá. */
    instance?: EquipmentInstanceMessage;
    /** Nguyên liệu nhận được khi phân rã. */
    materials?: MaterialAmountMessage[];
}

export interface DisassemblePreviewMessage {
    instanceIds: string[];
    /** Nguyên liệu sẽ nhận. */
    materials: MaterialAmountMessage[];
}

/** 1 nguyên liệu cần và số player đang có. */
export interface MaterialRequirementMessage {
    itemId: string;
    code: string;
    quantity: number;
    owned: number;
}

/** `data` của `upgradePreview`; món không nâng được nữa thì `Result` thất bại (`error` mang `action`, `instanceId`). */
export interface UpgradePreviewMessage {
    action: EquipmentUpgradeAction;
    instanceId: string;
    /** Tỉ lệ thành công 0 → 1. */
    rate: number;
    gold: number;
    ownedGold: number;
    materials: MaterialRequirementMessage[];
    /** Đủ vàng + nguyên liệu để làm ngay. */
    affordable: boolean;
    /** Cường hoá: cấp sau khi thành công. */
    enhanceLevel?: number;
    /** Cường hoá: thất bại thì tụt 1 cấp. */
    downgradeOnFail?: boolean;
    /** Tinh hoá: rarity sau khi thành công. */
    rarity?: ItemRarity;
    /**
     * Main stats của món sau khi nâng cấp thành công (đã nhân hệ số cường hoá/tinh hoá mới) — so với
     * `finalMainStats` hiện tại của món để hiện mức tăng. Tinh hoá còn thêm 1 dòng rarity ngẫu nhiên, dòng đó không có ở đây.
     */
    finalMainStats: StatLineMessage[];
}
