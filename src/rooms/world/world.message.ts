import type { ItemType } from "@/modules/items/enums/item.enum.js";
import type { ItemEquipmentInstanceMetadata } from "@/modules/items/schemas/item-metadata.schema.js";
import type { CurrencyReward, ItemReward } from "@/modules/rewards/types/reward.type.js";
import type { Equipments, Inventories } from "@/modules/player/schemas/inventory.schema.js";
import type { Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";
import type { Wallet } from "@/modules/player/schemas/wallet.schema.js";

/** Message client → server của room world. */
export enum WorldClientMessage {
    /** `{ strength?, dexterity?, intelligence?, vitality?, luck? }` — số điểm tiềm năng muốn cộng. */
    ALLOCATE_ATTRIBUTES = "allocateAttributes",
    /** `{ instanceId, slot? }` — mặc trang bị trong túi (slot đang có đồ thì đổi chỗ). */
    EQUIP_ITEM = "equipItem",
    /** `{ slot }` — tháo trang bị về túi. */
    UNEQUIP_ITEM = "unequipItem",
    /** `{ type, fromSlot, toSlot }` — chuyển / đổi chỗ 2 ô trong cùng túi. */
    MOVE_ITEM = "moveItem",
    /** `{ instanceId, locked }` — khoá món (không phân rã được). */
    LOCK_ITEM = "lockItem",
    /** `{ instanceId }` — cường hoá (trong túi hoặc đang mặc). */
    ENHANCE_EQUIPMENT = "enhanceEquipment",
    /** `{ instanceId }` — tinh hoá lên rarity kế tiếp. */
    REFINE_EQUIPMENT = "refineEquipment",
    /** `{ instanceIds }` — phân rã trang bị trong túi ra tinh linh + bụi. */
    DISASSEMBLE_ITEMS = "disassembleItems",
}

/** Message server → client của room world (ngoài state). */
export enum WorldMessage {
    /** Gửi riêng cho người nhận thưởng — client hiện chữ nổi "+exp / +gold / level up". */
    REWARD = "reward",
    /** Trả lời `allocateAttributes` (kể cả khi lỗi) — điểm còn lại, attribute và stat sau khi tính lại. */
    ATTRIBUTES = "attributes",
    /** Túi + đồ đang mặc + ví — gửi lúc vào room và trả lời mọi thao tác inventory (kể cả lỗi). */
    INVENTORY = "inventory",
    /** Kết quả cường hoá / tinh hoá / phân rã (thành công hay thất bại theo tỉ lệ). */
    EQUIPMENT_UPGRADE = "equipmentUpgrade",
    /** Túi còn ≤ `inventoryNearlyFullThreshold` ô trống sau khi nhận item. */
    INVENTORY_NEARLY_FULL = "inventoryNearlyFull",
    /** Túi đầy — các item nhận được nhưng không còn chỗ (bị mất). */
    INVENTORY_FULL = "inventoryFull",
}

export interface RewardMessage {
    exp: number;
    currency: CurrencyReward[];
    /** Item rơi ra (trước khi xếp túi — túi đầy thì có thêm message `inventoryFull`). */
    items: ItemReward[];
    /** Level sau khi cộng exp. */
    level: number;
    /** Số level vừa lên (0 = không lên). */
    levelsGained: number;
}

export interface AttributeSummary {
    attributePoints: number;
    /** Điểm player đã tự cộng. */
    allocatedAttributes: Attributes;
    /** Attribute cuối cùng (class + đã cộng + trang bị). */
    attributes: Attributes;
    stats: Stats;
}

export interface AttributesMessage extends AttributeSummary {
    ok: boolean;
    error?: string;
}

export interface InventoryMessage {
    ok: boolean;
    error?: string;
    inventories: Inventories;
    equipments: Equipments;
    wallet: Wallet;
}

export type EquipmentUpgradeAction = "enhance" | "refine" | "disassemble";

export interface EquipmentUpgradeMessage {
    action: EquipmentUpgradeAction;
    /** Roll tỉ lệ thành công (phân rã luôn `true`). */
    success: boolean;
    instanceIds: string[];
    /** Chỉ số của món sau khi cường hoá / tinh hoá. */
    instance?: ItemEquipmentInstanceMetadata;
    /** Nguyên liệu nhận được khi phân rã. */
    materials?: { itemId: string; code: string; quantity: number }[];
}

export interface InventoryNearlyFullMessage {
    type: ItemType;
    freeSlots: number;
}

export interface InventoryFullMessage {
    type: ItemType;
    lostItems: ItemReward[];
}
