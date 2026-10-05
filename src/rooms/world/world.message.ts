import type { ItemSource, ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

/*
 * Payload message được `yarn schema:generate` sinh ra C# (namespace ERPG.Schema). Codegen chỉ sinh
 * interface có chữ "Message" trong tên + enum, không hiểu `extends` / type alias / kiểu inline /
 * `| null` — mọi kiểu lồng nhau phải là interface `...Message` hoặc enum, khai báo từng field.
 */

/** Message client → server của room world. */
export enum WorldClientMessage {
    /** `{ strength?, dexterity?, intelligence?, vitality?, luck? }` — số điểm tiềm năng muốn cộng. */
    ALLOCATE_ATTRIBUTES = "allocateAttributes",
    /** Giống `allocateAttributes` nhưng chỉ tính thử — trả `attributesPreview`, không đổi gì trên player. */
    PREVIEW_ATTRIBUTES = "previewAttributes",
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
    /** Trả lời `previewAttributes`: điểm, attribute và stat nếu cộng như yêu cầu (chưa lưu). */
    ATTRIBUTES_PREVIEW = "attributesPreview",
    /** Túi + đồ đang mặc + ví — gửi lúc vào room và trả lời mọi thao tác inventory (kể cả lỗi). */
    INVENTORY = "inventory",
    /** Kết quả cường hoá / tinh hoá / phân rã (thành công hay thất bại theo tỉ lệ). */
    EQUIPMENT_UPGRADE = "equipmentUpgrade",
    /** Túi còn ≤ `inventoryNearlyFullThreshold` ô trống sau khi nhận item. */
    INVENTORY_NEARLY_FULL = "inventoryNearlyFull",
    /** Túi đầy — các item nhận được nhưng không còn chỗ (bị mất). */
    INVENTORY_FULL = "inventoryFull",
}

export enum EquipmentUpgradeAction {
    ENHANCE = "enhance",
    REFINE = "refine",
    DISASSEMBLE = "disassemble",
}

/** 1 dòng chỉ số (StatBonus). */
export interface StatLineMessage {
    stat: StatKey;
    type: StatType;
    value: number;
}

/** Chỉ số của 1 trang bị (ItemEquipmentInstanceMetadata) — main stats là giá trị roll gốc. */
export interface EquipmentInstanceMessage {
    level: number;
    rarity: ItemRarity;
    enhanceLevel: number;
    refineLevel: number;
    mainStats: StatLineMessage[];
    /** `mainStats` sau khi nhân hệ số cường hoá/tinh hoá — giá trị thật đang cộng cho player (message `inventory`). */
    finalMainStats?: StatLineMessage[];
    subStats: StatLineMessage[];
    rarityStats: StatLineMessage[];
}

/** 1 ô trong túi; `metadata` chỉ có với trang bị. */
export interface InventoryEntryMessage {
    id: string;
    itemId: string;
    /** Code của item — client tra tên, mô tả, icon theo code. */
    code: string;
    type: ItemType;
    /** Rarity gốc của item; trang bị lấy rarity của món trong `metadata`. */
    rarity: ItemRarity;
    slotIndex: number;
    quantity: number;
    source: ItemSource;
    isLocked: boolean;
    metadata?: EquipmentInstanceMessage;
}

/** 3 túi theo ItemType. */
export interface InventoriesMessage {
    equipment: InventoryEntryMessage[];
    consumable: InventoryEntryMessage[];
    material: InventoryEntryMessage[];
}

export interface EquippedItemMessage {
    id: string;
    itemId: string;
    code: string;
    type: ItemType;
    rarity: ItemRarity;
    source: ItemSource;
    isLocked: boolean;
    metadata: EquipmentInstanceMessage;
}

/** Đồ đang mặc theo slot (ItemEquipmentSlotType); slot trống = null. */
export interface EquipmentsMessage {
    main_hand?: EquippedItemMessage;
    off_hand?: EquippedItemMessage;
    head?: EquippedItemMessage;
    armor?: EquippedItemMessage;
    shoulder?: EquippedItemMessage;
    gloves?: EquippedItemMessage;
    boots?: EquippedItemMessage;
    belt?: EquippedItemMessage;
    necklace?: EquippedItemMessage;
    earring_1?: EquippedItemMessage;
    earring_2?: EquippedItemMessage;
    ring_1?: EquippedItemMessage;
    ring_2?: EquippedItemMessage;
    back?: EquippedItemMessage;
}

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

export interface ItemRewardMessage {
    itemId: string;
    quantity: number;
    /** Trang bị: chỉ số đã roll (quantity = 1). */
    metadata?: EquipmentInstanceMessage;
}

/** Nguyên liệu nhận được (phân rã). */
export interface MaterialAmountMessage {
    itemId: string;
    code: string;
    quantity: number;
}

/** Điểm attribute theo từng attribute. */
export interface AttributeValuesMessage {
    strength: number;
    dexterity: number;
    intelligence: number;
    vitality: number;
    luck: number;
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

/** Điểm + attribute + stat sau khi tính lại (PlayerWorldState.getAttributeSummary). */
export interface AttributeSummary {
    attributePoints: number;
    /** Điểm player đã tự cộng. */
    allocatedAttributes: AttributeValuesMessage;
    /** Attribute cuối cùng (class + đã cộng + trang bị). */
    attributes: AttributeValuesMessage;
    /** StatKey → giá trị (chỉ có stat khác 0). */
    stats: Record<string, number>;
}

export interface AttributesMessage {
    ok: boolean;
    error?: string;
    attributePoints: number;
    allocatedAttributes: AttributeValuesMessage;
    attributes: AttributeValuesMessage;
    stats: Record<string, number>;
}

/** Số ô tối đa của từng túi (master data `player_config.inventorySize`). */
export interface InventorySizesMessage {
    equipment: number;
    consumable: number;
    material: number;
}

export interface InventoryMessage {
    ok: boolean;
    error?: string;
    inventories: InventoriesMessage;
    /** Sức chứa từng túi — client vẽ đủ ô, ô trống để nền. */
    sizes: InventorySizesMessage;
    /** Class code của đồ mà player mặc được (class hiện tại + class tier thấp hơn chuyển cấp tới nó); đồ dùng chung luôn mặc được. */
    usableClassCodes: string[];
    equipments: EquipmentsMessage;
    wallet: WalletMessage;
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

export interface InventoryNearlyFullMessage {
    type: ItemType;
    freeSlots: number;
}

export interface InventoryFullMessage {
    type: ItemType;
    lostItems: ItemRewardMessage[];
}
