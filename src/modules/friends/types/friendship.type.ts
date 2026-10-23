import { type FriendshipRow } from "@/modules/friends/entities/friendship.entity.js";

/** Kết quả gửi lời mời: `sent` = lời mời mới, `accepted` = người kia đã mời mình trước nên thành bạn luôn. */
export interface FriendRequestOutcome {
    kind: "sent" | "accepted";
    friendship: FriendshipRow;
}

export interface FriendEntry {
    playerId: string;
    name: string;
    /** Thời điểm thành bạn (epoch ms). */
    since: number;
}

export interface FriendRequestEntry {
    playerId: string;
    name: string;
    /** Thời điểm gửi lời mời (epoch ms). */
    sentAt: number;
}

export interface FriendLists {
    friends: FriendEntry[];
    /** Lời mời gửi tới mình, chờ mình trả lời. */
    received: FriendRequestEntry[];
    /** Lời mời mình đã gửi, chờ họ trả lời. */
    sent: FriendRequestEntry[];
}
