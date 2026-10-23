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
}

/** Message server → client của room world (ngoài state). */
export enum WorldMessage {
    /** Gửi riêng cho người nhận thưởng — client hiện chữ nổi "+exp / +gold / level up". */
    REWARD = "reward",
    /** Ví (`WalletMessage`) — gửi riêng khi tiền đổi mà không kèm `inventoryChanged` (vd nhận tiền khi giết quái). */
    WALLET = "wallet",
    /** 1 node thoại để hiện — gửi khi bắt đầu thoại và sau mỗi lần chọn. */
    DIALOGUE = "dialogue",
    /** Thoại kết thúc (hết node, đóng, đi quá xa) hoặc server chủ động đóng vì lỗi (vd teleport thất bại). */
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
    /** Danh sách map có thể teleport tới — gửi khi dùng bệ teleport (`interact`). */
    TELEPORT_LIST = "teleportList",
    /** Chức năng đã mở khoá (quest hero) — gửi lúc vào room và khi mở thêm. */
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
