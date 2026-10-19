import type { ItemSource, ItemRarity, ItemType } from "@/modules/items/enums/item.enum.js";
import type { QuestCategory, QuestState } from "@/modules/quests/enums/quest.enum.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { StatKey, StatType } from "@/modules/player/enums/stat.enum.js";

/*
 * Payload message được `yarn unity:network` sinh ra C# (namespace ERPG.Schema). Codegen chỉ sinh
 * interface có chữ "Message" trong tên + enum, không hiểu `extends` / type alias / kiểu inline /
 * `| null` — mọi kiểu lồng nhau phải là interface `...Message` hoặc enum, khai báo từng field.
 */

/** Message client → server của room world. */
export enum WorldClientMessage {
    /** Requests the skill and targeting configuration used by this server. No payload. */
    REQUEST_SKILL_CONFIGS = "requestSkillConfigs",
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
    /** `{ instanceId }` — dùng 1 bình hồi HP / MP trong túi. */
    USE_ITEM = "useItem",
    /** `{ playerId }` — xin xem thông tin (trang bị + chỉ số) của người chơi khác cùng map; trả `playerView`. */
    VIEW_PLAYER = "viewPlayer",
    /** `{ playerId }` — xin vào party của người đó (chủ party nhận được `partyJoinRequest`). */
    PARTY_REQUEST_JOIN = "partyRequestJoin",
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
    /** `{ questCode }` — xem trước quest (mục tiêu, thưởng) trước khi nhận; trả `questPreview`. */
    QUEST_PREVIEW = "questPreview",
    /** Rời dungeon, về chỗ đứng trước khi vào. */
    DUNGEON_LEAVE = "dungeonLeave",
    /** Sau khi clear dungeon: đi lại dungeon này (cả nhóm bấm "đi lại" vào chung một instance mới). */
    DUNGEON_RETRY = "dungeonRetry",
    /** `{ mapCode }` — dịch chuyển tới bệ teleport của map đó (phải đang đứng gần một bệ teleport). */
    TELEPORT_TO = "teleportTo",
    /** Tạo party (chưa có thì server tạo mới) — trả `party { roomId }` để client `joinById`. */
    PARTY_CREATE = "partyCreate",
    /** `{ partyRoomId }` — từ chối lời mời party. */
    PARTY_DECLINE = "partyDecline",
}

/** Message server → client của room world (ngoài state). */
export enum WorldMessage {
    /** JSON configuration returned only to the client that requested it. */
    SKILL_CONFIGS = "skillConfigs",
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
    /** Quái / item / vật thể / NPC / hầm ngục liên quan quest đang làm — client đánh chữ Q. */
    QUEST_TARGETS = "questTargets",
    /** Trả lời `questPreview`: quest kèm mục tiêu và phần thưởng. */
    QUEST_PREVIEW = "questPreview",
    /** Danh sách map có thể teleport tới — gửi khi dùng bệ teleport (`interact`). */
    TELEPORT_LIST = "teleportList",
    /** Room party của người chơi: client `joinById(roomId)` (sau `partyCreate`, hoặc khi chấp nhận lời mời thì dùng `partyRoomId` của lời mời). */
    PARTY = "party",
    /** Lời mời vào party. Chấp nhận = `joinById(partyRoomId)` trong hạn; từ chối = `partyDecline`. */
    PARTY_INVITE_RECEIVED = "partyInviteReceived",
    /** Chức năng đã mở khoá (quest hero) — gửi lúc vào room và khi mở thêm. */
    FEATURES = "features",
    /** Chamber vừa dọn xong — cổng exit mở. */
    DUNGEON_CHAMBER_CLEAR = "dungeonChamberClear",
    /** Hạ boss, clear dungeon — sắp bị đưa ra ngoài. */
    DUNGEON_CLEAR = "dungeonClear",
    /** Trả lời `dungeonRetry` khi không đi lại được: `Result` thất bại (`DUNGEON_UNAVAILABLE`, `PARTY_NOT_LEADER`, `DUNGEON_NOT_TOGETHER`, `DUNGEON_DENIED`). Thành công thì không có reply, `mapChange` đến thay. */
    DUNGEON_RETRY_RESULT = "dungeonRetryResult",
    /** Có người vừa uống bình: số HP / MP thực sự hồi được (client hiện "+N" trên đầu người đó). */
    POTION_USED = "potionUsed",
    /** Skill vừa gắn hiệu ứng lên một số người (hồi đồng đội...): client gắn prefab hiệu ứng của skill lên từng người. */
    SKILL_EFFECT = "skillEffect",
    /** Thông tin xem được của một người chơi khác (trả lời `viewPlayer`). */
    PLAYER_VIEW = "playerView",
    /** Có người xin vào party của bạn (bạn là chủ): chấp nhận = mời họ, họ vào luôn. */
    PARTY_JOIN_REQUEST = "partyJoinRequest",
    /** Thông báo party do world room gửi (cùng dạng `notice` của party room). */
    PARTY_NOTICE = "partyNotice",
}

/** Room mà client phải join sau `mapChange`. */
export enum WorldRoomName {
    WORLD = "world",
    DUNGEON = "dungeon",
}

/**
 * Dấu trên đầu NPC của riêng player (màu theo `category` của quest, xám khi chưa cần làm gì thêm):
 * - available `!` màu loại quest — có quest chưa nhận.
 * - talkTarget `!` xám — NPC là đích nói chuyện của quest đang làm.
 * - inProgress `?` xám — quest đang làm, trả ở NPC này.
 * - ready `?` màu loại quest — quest xong, đến trả.
 */
export enum NpcMarker {
    NONE = "none",
    AVAILABLE = "available",
    TALK_TARGET = "talkTarget",
    IN_PROGRESS = "inProgress",
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
    /** Bình hồi máu / mana: lượng hồi mỗi lần dùng (để mô tả item cho đúng). */
    heal?: number;
    mana?: number;
}

/** `data` của `playerView`; người đó không ở cùng map thì `Result` thất bại `PLAYER_NOT_HERE`. */
export interface PlayerViewMessage {
    playerId: string;
    name: string;
    level: number;
    classCode: string;
    baseClassCode: string;
    equipments: EquipmentsMessage;
    /** Attribute cuối cùng (class + đã cộng + trang bị). */
    attributes: AttributeValuesMessage;
    /** StatKey → giá trị (chỉ có stat khác 0). */
    stats: Record<string, number>;
}

export interface PartyJoinRequestMessage {
    partyRoomId: string;
    fromName: string;
    expiresInSec: number;
}

export interface PotionUsedMessage {
    /** playerId của người uống / được hồi — khoá của nhân vật bên client. */
    playerId: string;
    /** HP / MP hồi được. Bình: đã trừ phần vượt trần; hồi của skill: lượng hồi của skill, hiện cả khi đã đầy máu. */
    hp: number;
    mp: number;
}

/** Skill gắn hiệu ứng (prefab `Resources/Prefabs/SkillEffects/<code của skill>`) lên các nhân vật này. */
export interface SkillEffectMessage {
    skillId: string;
    /** playerId của các người chơi nhận hiệu ứng. */
    playerIds: string[];
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
export interface AttributesMessage {
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
}

export interface InventoryNearlyFullMessage {
    type: ItemType;
    freeSlots: number;
}

export interface InventoryFullMessage {
    type: ItemType;
    lostItems: ItemRewardMessage[];
}

/** `data` của `interactResult`; thất bại thì `error` mang `id`. */
export interface InteractResultMessage {
    /** Id vật thể (hoặc npcCode / mapCode) đã tương tác. */
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
    /** Quest mà các option của node này nhận (action `start_quest`) — client hiện xem trước phần thưởng. */
    offerQuestCodes: string[];
}

/** `data` của `dialogueEnd`; kết thúc vì lỗi thì `Result` thất bại và `error` mang `sourceCode`. */
export interface DialogueEndMessage {
    sourceCode: string;
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
    /** Room cần join: `world` (filter `mapCode`) hoặc `dungeon` (filter `instanceId`, kèm `mapCode`). */
    roomName: WorldRoomName;
    /** Chỉ dungeon: id instance — join room `dungeon` với option `{ mapCode, instanceId }`. */
    instanceId?: string;
}

export interface DungeonChamberClearMessage {
    chamberIndex: number;
    chamberCount: number;
}

/** Những gì 1 người nhận được trong lần đi dungeon này (chamber, clear, quái rơi) — bảng thưởng sau khi clear. */
export interface DungeonRewardMemberMessage {
    playerId: string;
    name: string;
    classCode: string;
    level: number;
    exp: number;
    currency: CurrencyRewardMessage[];
    items: ItemRewardMessage[];
}

export interface DungeonClearMessage {
    /** Giây nữa người chơi bị đưa ra ngoài. */
    leaveInSec: number;
    /** Phần thưởng của từng người trong nhóm (tối đa 4, theo thứ tự vào). */
    members: DungeonRewardMemberMessage[];
    /** Chủ nhóm — chỉ người này được bấm "đi lại" (rỗng = không rõ, ai cũng thử được và server quyết). */
    leaderPlayerId: string;
}

export interface PartyRoomMessage {
    roomId: string;
}

export interface PartyInviteReceivedMessage {
    /** Lời mời sinh ra từ một yêu cầu xin vào: người nhận vào luôn, không cần bấm đồng ý. */
    autoAccept?: boolean;
    partyRoomId: string;
    fromName: string;
    expiresInSec: number;
}

export interface TeleportDestinationMessage {
    mapCode: string;
    minLevel: number;
    /** Map có bệ teleport đã đặt và đang mở — `false` thì hiện mờ, không chọn được. */
    open: boolean;
    /** Đã từng đến map này — chưa đến thì chưa teleport tới được. */
    discovered: boolean;
    /** Teleport tới được ngay: đã đến map này và đủ level. */
    available: boolean;
}

export interface TeleportListMessage {
    destinations: TeleportDestinationMessage[];
}

export interface FeaturesMessage {
    /** Mã chức năng đã mở khoá, vd `guild`, `quest_board`, `daily_quest`, `dungeon`, `next_phase`. */
    features: string[];
}

export interface QuestObjectiveMessage {
    id: string;
    current: number;
    count: number;
}

export interface QuestCurrencyRewardMessage {
    code: CurrencyCode;
    amount: number;
}

export interface QuestItemRewardMessage {
    itemCode: string;
    quantity: number;
}

/** Phần thưởng hiển thị trước (xem trước / danh sách quest). */
export interface QuestRewardMessage {
    exp: number;
    currency: QuestCurrencyRewardMessage[];
    items: QuestItemRewardMessage[];
}

export interface QuestMessage {
    code: string;
    state: QuestState;
    /** hero đỏ · side vàng · daily xanh lá. */
    category: QuestCategory;
    requiredLevel: number;
    giverNpcCode: string;
    turnInNpcCode: string;
    objectives: QuestObjectiveMessage[];
    rewards: QuestRewardMessage;
}

export interface QuestPreviewMessage {
    quest: QuestMessage;
}

export interface QuestTargetsMessage {
    /** Code quái cần giết — dấu Q bên trái tên. */
    monsterCodes: string[];
    /** Code item cần có trong túi — dấu Q góc trên phải. */
    itemCodes: string[];
    interactableIds: string[];
    npcCodes: string[];
    dungeonMapCodes: string[];
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
    /** Loại quest quyết định màu dấu; bỏ trống khi `marker` = none. */
    category?: QuestCategory;
}

export interface NpcMarkersMessage {
    markers: NpcMarkerEntryMessage[];
}
