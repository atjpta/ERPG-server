import type { ItemSource, ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { QuestState } from "@/modules/quests/enums/quest.enum.js";
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
    /** Giống `disassembleItems` nhưng chỉ tính thử — trả `disassemblePreview`, không đổi gì trên player. */
    PREVIEW_DISASSEMBLE = "previewDisassemble",
    /** `{ action: "enhance" | "refine", instanceId }` — chi phí / tỉ lệ cường hoá hoặc tinh hoá, trả `upgradePreview`. */
    PREVIEW_UPGRADE = "previewUpgrade",
    /** `{ id }` — tương tác vật thể trong map (portal, thu thập, biển báo) theo id trong file map. */
    INTERACT = "interact",
    /** `{ npcCode }` — bắt đầu nói chuyện với NPC (phải đứng trong `interactRadius`). */
    INTERACT_NPC = "interactNpc",
    /** `{ optionId }` — chọn option của node thoại hiện tại; `optionId` rỗng = "Tiếp tục". */
    DIALOGUE_CHOOSE = "dialogueChoose",
    /** Đóng hội thoại đang mở. */
    DIALOGUE_CLOSE = "dialogueClose",
    /** Xin danh sách quest đang làm (trả `questList`). */
    QUEST_LIST = "questList",
    /** `{ questCode }` — bỏ quest đang làm. */
    QUEST_ABANDON = "questAbandon",
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
    /** Ví (`WalletMessage`) — gửi riêng khi tiền đổi mà không kèm `inventory` (vd nhận tiền khi giết quái). */
    WALLET = "wallet",
    /** Kết quả cường hoá / tinh hoá / phân rã (thành công hay thất bại theo tỉ lệ). */
    EQUIPMENT_UPGRADE = "equipmentUpgrade",
    /** Trả lời `previewDisassemble`: nguyên liệu sẽ nhận nếu phân rã (hoặc lỗi nếu không phân rã được). */
    DISASSEMBLE_PREVIEW = "disassemblePreview",
    /** Trả lời `previewUpgrade`: chi phí, tỉ lệ và player có đủ để cường hoá / tinh hoá không. */
    UPGRADE_PREVIEW = "upgradePreview",
    /** Túi còn ≤ `inventoryNearlyFullThreshold` ô trống sau khi nhận item. */
    INVENTORY_NEARLY_FULL = "inventoryNearlyFull",
    /** Túi đầy — các item nhận được nhưng không còn chỗ (bị mất). */
    INVENTORY_FULL = "inventoryFull",
    /** Kết quả `interact` (kể cả lỗi) — thành công thì kèm thêm message của hiệu ứng (reward, mapChange, dialogue...). */
    INTERACT_RESULT = "interactResult",
    /** 1 node thoại để hiện — gửi khi bắt đầu thoại và sau mỗi lần chọn. */
    DIALOGUE = "dialogue",
    /** Thoại kết thúc (hết node, đi quá xa, hay lỗi). */
    DIALOGUE_END = "dialogueEnd",
    /** Mở UI chức năng của NPC (shop, cường hoá...). */
    NPC_FUNCTION_OPEN = "npcFunctionOpen",
    /** Player đã được chuyển sang map khác — client rời room này và vào room của `mapCode`. */
    MAP_CHANGE = "mapChange",
    /** Danh sách quest đang làm và tiến độ. */
    QUEST_LIST = "questList",
    /** 1 quest vừa đổi (nhận, tiến độ, hoàn thành, bỏ). */
    QUEST_UPDATE = "questUpdate",
    /** Dấu `!` / `?` trên đầu NPC của riêng player này — cũng dùng cho minimap. */
    NPC_MARKERS = "npcMarkers",
}

export enum NpcMarker {
    NONE = "none",
    /** Có quest nhận được. */
    AVAILABLE = "available",
    /** Có quest đang làm chưa xong. */
    IN_PROGRESS = "inProgress",
    /** Có quest xong, đến trả. */
    READY = "ready",
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
    /** Catalog display data so newly dropped items can be shown before the inventory update. */
    code?: string;
    rarity?: ItemRarity;
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

export interface DisassemblePreviewMessage {
    ok: boolean;
    error?: string;
    instanceIds: string[];
    /** Nguyên liệu sẽ nhận (rỗng khi lỗi). */
    materials: MaterialAmountMessage[];
}

/** 1 nguyên liệu cần và số player đang có. */
export interface MaterialRequirementMessage {
    itemId: string;
    code: string;
    quantity: number;
    owned: number;
}

export interface UpgradePreviewMessage {
    /** `false` khi món không nâng được nữa (`error` là lý do) — chi phí khi đó để trống. */
    ok: boolean;
    error?: string;
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
}

export interface InventoryNearlyFullMessage {
    type: ItemType;
    freeSlots: number;
}

export interface InventoryFullMessage {
    type: ItemType;
    lostItems: ItemRewardMessage[];
}

export interface InteractResultMessage {
    ok: boolean;
    error?: string;
    /** Id vật thể (hoặc npcCode) đã tương tác. */
    id: string;
}

export interface DialogueOptionMessage {
    id: string;
    /** Key locale của chữ trên nút. */
    textKey: string;
    /** `false` = không đủ điều kiện (hiện mờ). */
    enabled: boolean;
}

export interface DialogueMessage {
    /** NPC code, hoặc id vật thể (biển báo) đang nói. */
    sourceCode: string;
    dialogueCode: string;
    nodeId: string;
    /** Key locale của lời thoại. */
    textKey: string;
    /** Key locale của người nói; trống = dùng tên NPC. */
    speakerKey?: string;
    options: DialogueOptionMessage[];
    /** Không có option nhưng còn node sau → hiện nút "Tiếp tục" (gửi `dialogueChoose` với optionId rỗng). */
    hasNext: boolean;
}

export interface DialogueEndMessage {
    sourceCode: string;
    error?: string;
}

export interface NpcFunctionOpenMessage {
    npcCode: string;
    functionId: string;
    /** NpcFunctionType: shop, storage, enhance, refine, disassemble, quest_board. */
    type: string;
    /** Tham số riêng của chức năng, dạng JSON. */
    config: string;
}

export interface MapChangeMessage {
    mapCode: string;
    /** Điểm đến trong map mới (id spawn point). */
    spawnId: string;
}

export interface QuestObjectiveMessage {
    id: string;
    current: number;
    count: number;
}

export interface QuestMessage {
    code: string;
    state: QuestState;
    objectives: QuestObjectiveMessage[];
}

export interface QuestListMessage {
    quests: QuestMessage[];
}

export interface QuestUpdateMessage {
    quest: QuestMessage;
}

export interface NpcMarkerEntryMessage {
    npcCode: string;
    marker: NpcMarker;
}

export interface NpcMarkersMessage {
    markers: NpcMarkerEntryMessage[];
}
