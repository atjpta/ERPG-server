/*
 * Payload message được `yarn unity:network` sinh ra C# (namespace ERPG.Schema). Codegen chỉ sinh
 * interface có chữ "Message" trong tên + enum, không hiểu `extends` / type alias / kiểu inline /
 * `| null` — mọi kiểu lồng nhau phải là interface `...Message` hoặc enum, khai báo từng field.
 */

/** Message client → server của room world. */
export enum WorldClientMessage {
    /** Requests the skill and targeting configuration used by this server. No payload. */
    REQUEST_SKILL_CONFIGS = "requestSkillConfigs",
    /** `{ instanceId }` — dùng 1 bình hồi HP / MP trong túi. */
    USE_ITEM = "useItem",
    /** `{ playerId }` — xin xem thông tin (trang bị + chỉ số) của người chơi khác cùng map; trả `playerView`. */
    VIEW_PLAYER = "viewPlayer",
    /**
     * `{ id }` — tương tác với NPC hoặc vật thể (cổng, bệ teleport, bảng thông báo, điểm thu thập) theo id slot trong file map; phải đứng trong
     * bán kính tương tác. NPC thường mở thoại; vật thể `autoOpen` chạy chức năng luôn. Response là `InteractResultMessage`.
     */
    INTERACT_NPC = "interactNpc",
    /** `{ optionId }` — chọn option của node thoại hiện tại; `optionId` rỗng = "Tiếp tục". */
    DIALOGUE_CHOOSE = "dialogueChoose",
    /** Đóng hội thoại đang mở. */
    DIALOGUE_CLOSE = "dialogueClose",
    /** Không có payload — ví hiện tại; response là `WalletMessage`. Gọi lúc vào room; sau đó cập nhật theo push `wallet`. */
    GET_WALLET = "getWallet",
    /** Không có payload — quest đang làm và tiến độ; response là `QuestListMessage`. Gọi lúc vào room; sau đó cập nhật theo push `questUpdate` / `questList`. */
    GET_QUEST_LIST = "getQuestList",
    /** Không có payload — dấu `!` / `?` trên đầu NPC của map này; response là `NpcMarkersMessage`. Gọi lúc vào room; sau đó cập nhật theo push `npcMarkers`. */
    GET_NPC_MARKERS = "getNpcMarkers",
    /** Không có payload — quái / item / vật thể liên quan quest đang làm; response là `QuestTargetsMessage`. Gọi lúc vào room; sau đó cập nhật theo push `questTargets`. */
    GET_QUEST_TARGETS = "getQuestTargets",
    /** Không có payload — chức năng đã mở khoá; response là `FeaturesMessage`. Gọi lúc vào room; sau đó cập nhật theo push `features`. */
    GET_FEATURES = "getFeatures",
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
}

/** Message server → client của room world (ngoài state). */
export enum WorldMessage {
    /** Gửi riêng cho người nhận thưởng — client hiện chữ nổi "+exp / +gold / level up". */
    REWARD = "reward",
    /** Ví (`WalletMessage`) — gửi mỗi khi tiền đổi (thưởng, trả phí, thư...). Số dư ban đầu lấy bằng `getWallet`. */
    WALLET = "wallet",
    /** 1 node thoại để hiện — gửi khi bắt đầu thoại và sau mỗi lần chọn. */
    DIALOGUE = "dialogue",
    /** Thoại kết thúc (hết node, đóng, đi quá xa) hoặc server chủ động đóng vì lỗi (vd teleport thất bại). */
    DIALOGUE_END = "dialogueEnd",
    /** Mở UI chức năng của NPC (shop, cường hoá...). */
    NPC_FUNCTION_OPEN = "npcFunctionOpen",
    /** Player đã được chuyển sang map khác — client rời room này và vào room của `mapCode`. */
    MAP_CHANGE = "mapChange",
    /** Thay cả danh sách quest đang làm — chỉ gửi khi cả danh sách đổi (giao quest hằng ngày mới). Danh sách ban đầu lấy bằng `getQuestList`. */
    QUEST_LIST = "questList",
    /** 1 quest vừa đổi (nhận, tiến độ, hoàn thành, bỏ). */
    QUEST_UPDATE = "questUpdate",
    /** Dấu `!` / `?` trên đầu NPC của riêng player này — cũng dùng cho minimap. Gửi lại khi quest đổi; bản ban đầu lấy bằng `getNpcMarkers`. */
    NPC_MARKERS = "npcMarkers",
    /** Quái / item / vật thể / NPC / hầm ngục liên quan quest đang làm — client đánh chữ Q. Gửi lại khi quest đổi; bản ban đầu lấy bằng `getQuestTargets`. */
    QUEST_TARGETS = "questTargets",
    /** Danh sách map có thể teleport tới — gửi khi dùng bệ teleport (`interact`). */
    TELEPORT_LIST = "teleportList",
    /** Chức năng đã mở khoá (quest hero) — gửi khi mở thêm. Danh sách ban đầu lấy bằng `getFeatures`. */
    FEATURES = "features",
    /** Chamber vừa dọn xong — cổng exit mở. */
    DUNGEON_CHAMBER_CLEAR = "dungeonChamberClear",
    /** Hạ boss, clear dungeon — sắp bị đưa ra ngoài. */
    DUNGEON_CLEAR = "dungeonClear",
    /** Có người vừa uống bình: số HP / MP thực sự hồi được (client hiện "+N" trên đầu người đó). */
    POTION_USED = "potionUsed",
    /** Skill vừa gắn hiệu ứng lên một số người (hồi đồng đội...): client gắn prefab hiệu ứng của skill lên từng người. */
    SKILL_EFFECT = "skillEffect",
}
