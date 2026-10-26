import type { QuestCategory, QuestState } from "@/modules/quests/enums/quest.enum.js";
import type { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import type { NpcMarker } from "@/modules/npcs/enums/npc-marker.enum.js";

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
    /** Id slot của NPC / vật thể đã mở chức năng (`interactNpc { id }`). */
    slotId: string;
    functionId: string;
    /** NpcFunctionType: shop, storage, enhance, refine, disassemble, quest_board (UI); teleport mở bằng `teleportList`. */
    type: string;
    /** Tham số riêng của chức năng, dạng JSON. */
    config: string;
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
