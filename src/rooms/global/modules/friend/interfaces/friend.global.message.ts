import type { FriendChange } from "@/rooms/global/modules/friend/enums/friend-change.enum.js";
import type { FriendNotice } from "@/rooms/global/modules/friend/enums/friend-notice.enum.js";

/* DTO friend gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

/** Một người bạn. Level / HP của bạn không có ở đây. */
export interface FriendEntryMessage {
    playerId: string;
    name: string;
    /** Thời điểm thành bạn (epoch ms). */
    since: number;
    /** Đang kết nối global room. */
    online: boolean;
    /** Map đang đứng (chỉ có khi online và đã vào world). */
    mapCode?: string;
}

/** Một lời mời kết bạn (đã nhận hoặc đã gửi). */
export interface FriendRequestEntryMessage {
    playerId: string;
    name: string;
    /** Thời điểm gửi lời mời (epoch ms). */
    sentAt: number;
}

/** Một người trong danh sách chặn. */
export interface BlockedEntryMessage {
    playerId: string;
    name: string;
}

/** `data` của response `friendList`. */
export interface FriendListMessage {
    friends: FriendEntryMessage[];
    /** Lời mời gửi tới bạn, chờ bạn trả lời (`friendAccept` / `friendDecline`). */
    received: FriendRequestEntryMessage[];
    /** Lời mời bạn đã gửi, chờ họ trả lời (`friendCancel` để huỷ). */
    sent: FriendRequestEntryMessage[];
    blocked: BlockedEntryMessage[];
    /** Số bạn tối đa (`friend_config.maxFriends`). */
    maxFriends: number;
}

/** `data` của response `friendRequest` / `friendAccept`. */
export interface FriendNoticeMessage {
    notice: FriendNotice;
    /** Tên người liên quan. */
    playerName: string;
}

/** `data` của `GlobalMessage.FRIEND_CHANGED`. */
export interface FriendChangedMessage {
    change: FriendChange;
    playerId: string;
    name: string;
    /** Chỉ có khi `change = added`. */
    friend?: FriendEntryMessage;
}

/** `data` của `GlobalMessage.FRIEND_PRESENCE`: một người bạn online / offline / đổi map. */
export interface FriendPresenceMessage {
    playerId: string;
    online: boolean;
    /** Map đang đứng (chỉ có khi online và đã vào world). */
    mapCode?: string;
}
