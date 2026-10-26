/*
 * Payload message của global room — `yarn unity:network` sinh C# (xem ghi chú ở world/types/world-message.type.ts:
 * chỉ interface có chữ "Message" trong tên + enum, khai báo từng field).
 *
 * Global room là room theo game server (một room / serverId), giữ kết nối suốt phiên chơi cạnh world room:
 * chat, party và presence. Thao tác kiểu hỏi → đáp là Request/Response (`room.Request<T>`, response là `Result`);
 * `GlobalMessage` chỉ là các thông báo server chủ động đẩy xuống.
 */

/** Message client → global room (đều là request, nhận `Result` làm response). */
export enum GlobalClientMessage {
    // ---- Chat ----

    /** `{ content }` — nói với cả server. Response rỗng; mọi người nhận (kể cả người gửi) nhận `chatReceived`. */
    SEND_WORLD = "sendWorld",
    /** `{ content }` — chat local: nói với người cùng map (cùng `mapCode`, và cùng instance nếu là dungeon). */
    SEND_GENERAL = "sendGeneral",
    /** `{ content }` — nói với thành viên party. */
    SEND_PARTY = "sendParty",
    /** `{ targetName, content }` — nhắn riêng cho người chơi online theo tên. */
    SEND_WHISPER = "sendWhisper",
    /**
     * `{ channel, before? }` — xin lịch sử của một kênh có lưu DB; response là `ChatHistoryMessage`. Không có `before`:
     * trang mới nhất (`historyOnJoin` tin, gọi lúc vào game); có `before` (`id` của tin cũ nhất đang hiện): trang
     * `historyPageSize` tin cũ hơn nó (loadmore).
     */
    GET_HISTORY = "getHistory",

    // ---- Party ----

    /** Tạo party (chưa có thì server tạo mới, có rồi thì trả lại party hiện tại). Response là `PartyStateMessage`. */
    PARTY_CREATE = "partyCreate",
    /** `{ playerName, request? }` — chủ mời người chơi online theo tên. Response là `PartyNoticeMessage` (`invite_sent`). */
    PARTY_INVITE = "partyInvite",
    /** `{ partyId }` — nhận lời mời (`partyInviteReceived`) trong hạn. Response là `PartyStateMessage` của party vừa vào. */
    PARTY_ACCEPT_INVITE = "partyAcceptInvite",
    /** `{ partyId }` — từ chối lời mời party, chủ nhận notice `invite_declined`. */
    PARTY_DECLINE = "partyDecline",
    /** `{ playerId }` — xin vào party của người đó (cùng world room); chủ party nhận `partyJoinRequest`. */
    PARTY_REQUEST_JOIN = "partyRequestJoin",
    /** `{ playerId }` — chủ đá thành viên. */
    PARTY_KICK = "partyKick",
    /** `{ playerId }` — chủ nhường quyền chủ. */
    PARTY_PROMOTE = "partyPromote",
    /** Tự rời party. */
    PARTY_LEAVE = "partyLeave",
    /** Chủ giải tán party. */
    PARTY_DISBAND = "partyDisband",
    /** `{ mode }` — chủ đổi cách chia item (`PartyLootMode`). */
    PARTY_SET_LOOT = "partySetLoot",
    // ---- Friend ----

    /** Danh sách bạn (kèm presence), lời mời đã nhận / đã gửi và người bị chặn; response là `FriendListMessage`. Gọi lúc vào game. */
    FRIEND_LIST = "friendList",
    /** `{ playerName }` — gửi lời mời kết bạn (người nhận offline vẫn nhận được khi vào game). Nếu họ đã mời bạn trước thì thành bạn luôn. Response là `FriendNoticeMessage` (`request_sent` hoặc `friend_added`). */
    FRIEND_REQUEST = "friendRequest",
    /** `{ playerId }` — chấp nhận lời mời của người đó. Response là `FriendNoticeMessage` (`friend_added`). */
    FRIEND_ACCEPT = "friendAccept",
    /** `{ playerId }` — từ chối lời mời của người đó (họ không được báo). */
    FRIEND_DECLINE = "friendDecline",
    /** `{ playerId }` — huỷ lời mời bạn đã gửi cho người đó. */
    FRIEND_CANCEL = "friendCancel",
    /** `{ playerId }` — xoá bạn (cả hai phía). */
    FRIEND_REMOVE = "friendRemove",
    /** `{ playerName }` — chặn người chơi: huỷ quan hệ bạn bè / lời mời với họ, họ không gửi được lời mời, mời party hay nhắn riêng cho bạn. Response là `BlockedEntryMessage`. */
    FRIEND_BLOCK = "friendBlock",
    /** `{ playerId }` — bỏ chặn. */
    FRIEND_UNBLOCK = "friendUnblock",

    // ---- Mail ----

    /** Không có payload — hộp thư còn hạn (mới → cũ); thư hệ thống mang nội dung mọi ngôn ngữ (`texts`). Cũng phát các broadcast chưa nhận. Response là `MailListMessage`. */
    MAIL_LIST = "mailList",
    /** `{ mailId }` — đánh dấu đã đọc. Response là `MailReadMessage`. */
    MAIL_READ = "mailRead",
    /** `{ mailId }` — nhận đính kèm (item vào túi, tiền vào ví; thư COD thì trả giá trước). Response là `MailClaimedMessage`. */
    MAIL_CLAIM = "mailClaim",
    /** Nhận đính kèm của mọi thư không COD (tối đa `claimAllLimit`). Response là `MailClaimAllMessage`. */
    MAIL_CLAIM_ALL = "mailClaimAll",
    /** `{ mailId }` — người nhận từ chối / trả lại thư người chơi chưa nhận: đính kèm về người gửi bằng thư hệ thống. */
    MAIL_RETURN = "mailReturn",
    /** Thư mình đã gửi mà người nhận chưa claim (thu hồi được). Response là `MailSentListMessage`. */
    MAIL_SENT_LIST = "mailSentList",
    /** `{ mailId }` — người gửi thu hồi thư người nhận chưa claim (đã đọc vẫn thu hồi được); đính kèm trả về bằng thư hệ thống. */
    MAIL_RECALL = "mailRecall",
    /** `{ mailId }` — xoá thư đã đọc và đã nhận (hoặc không có đính kèm). */
    MAIL_DELETE = "mailDelete",
    /** Xoá mọi thư xoá được. Response là `MailDeletedMessage`. */
    MAIL_DELETE_READ = "mailDeleteRead",
    /** `{ targetName, subject, body, items:[{instanceId, quantity}], currency:[{code, amount}], cod?:{code, amount} }` — gửi thư cho người chơi cùng server (kể cả offline). Response là `MailSendResultMessage`. */
    MAIL_SEND = "mailSend",

    // ---- Gift code ----

    /** `{ code }` — nhập gift code (không phân biệt hoa thường). Quà vào hộp thư bằng thư hệ thống (`mailReceived`), nhận bằng `mailClaim`. Response là `GiftCodeRedeemedMessage`. */
    GIFT_CODE_REDEEM = "giftCodeRedeem",

    // ---- Player data (túi đồ, trang bị, điểm tiềm năng) ----

    /** `{ strength?, dexterity?, intelligence?, vitality?, luck? }` — số điểm tiềm năng muốn cộng. */
    UPDATE_ATTRIBUTES = "updateAttributes",
    /** Giống `updateAttributes` nhưng chỉ tính thử — trả `attributesPreview`, không đổi gì trên player. */
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
}

/** Message server → client của global room (thông báo server chủ động đẩy xuống). */
export enum GlobalMessage {
    // ---- Chat ----

    /** Có tin mới ở một kênh bạn thuộc về (kể cả tin do chính bạn gửi). `data` là `ChatReceivedMessage`. */
    CHAT_RECEIVED = "chatReceived",

    // ---- Party ----

    /** Trạng thái đầy đủ của party bạn đang ở — gửi cho mọi thành viên sau mỗi thay đổi (thành viên, chủ, loot, HP/level/map). `data` là `PartyStateMessage`. */
    PARTY_STATE = "partyState",
    /** Bạn không còn ở party này (tự rời, bị đá, giải tán, offline). `data` là `PartyLeftMessage`. */
    PARTY_LEFT = "partyLeft",
    /** Sự kiện của party (`data.notice`): có người vào / rời / bị đá, đổi chủ, lời mời hết hạn... `data` là `PartyNoticeMessage`. */
    PARTY_NOTICE = "partyNotice",
    /** Lời mời vào party. Chấp nhận = `partyAcceptInvite { partyId }` trong hạn; từ chối = `partyDecline { partyId }`. `data` là `PartyInviteReceivedMessage`. */
    PARTY_INVITE_RECEIVED = "partyInviteReceived",
    /** Có người xin vào party của bạn (bạn là chủ): chấp nhận = `partyInvite { playerName, request: true }`, họ vào luôn. `data` là `PartyJoinRequestMessage`. */
    PARTY_JOIN_REQUEST = "partyJoinRequest",
    /** Chủ bấm vào dungeon nhưng có người không đủ điều kiện — không ai vào. `Result` thất bại `DUNGEON_DENIED`, `error` là `PartyDungeonDeniedMessage`. */
    PARTY_DUNGEON_DENIED = "partyDungeonDenied",
    // ---- Friend ----

    /** Thay đổi danh sách bạn / lời mời (có bạn mới, bị xoá bạn, có lời mời). `data` là `FriendChangedMessage`. */
    FRIEND_CHANGED = "friendChanged",
    /** Một người bạn online / offline / đổi map. `data` là `FriendPresenceMessage`. */
    FRIEND_PRESENCE = "friendPresence",

    // ---- Mail ----

    /** Có thư mới (quà, thư người chơi, thư hoàn trả, thanh toán COD). `data` là `MailReceivedMessage`. */
    MAIL_RECEIVED = "mailReceived",
    /** Một thư biến khỏi hộp thư (người gửi thu hồi). `data` là `MailRemovedMessage`. */
    MAIL_REMOVED = "mailRemoved",

    // ---- Player data ----

    /** Điểm còn lại, attribute và stat sau khi tính lại — đẩy khi stat đổi mà không phải do `updateAttributes` (đổi trang bị, nâng cấp...). */
    ATTRIBUTES = "attributes",
    /** Toàn bộ túi + đồ đang mặc — chỉ gửi MỘT lần lúc vào room. Mọi thay đổi sau đó đến qua `inventoryChanged`. */
    INVENTORY = "inventory",
    /** Chi tiết thay đổi của túi / đồ đang mặc (ô thêm / đổi, ô mất, slot đổi) — gửi sau mỗi thao tác hoặc khi nhận item. `data` là `InventoryChangedMessage`. */
    INVENTORY_CHANGED = "inventoryChanged",
    /** Túi còn ≤ `inventoryNearlyFullThreshold` ô trống sau khi nhận item. */
    INVENTORY_NEARLY_FULL = "inventoryNearlyFull",
    /** Túi đầy — các item nhận được nhưng không còn chỗ (bị mất). */
    INVENTORY_FULL = "inventoryFull",
}
