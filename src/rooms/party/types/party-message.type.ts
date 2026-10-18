/*
 * Payload message của party room — `yarn unity:network` sinh C# (xem ghi chú ở types/world-message.type.ts:
 * chỉ interface có chữ "Message" trong tên + enum, khai báo từng field).
 */

/** Message client → party room. */
export enum PartyClientMessage {
    /** `{ playerName }` — chủ mời người chơi online theo tên. */
    INVITE = "invite",
    /** `{ playerId }` — chủ đá thành viên. */
    KICK = "kick",
    /** `{ playerId }` — chủ nhường quyền chủ. */
    PROMOTE = "promote",
    /** Tự rời party. */
    LEAVE = "leave",
    /** Chủ giải tán party. */
    DISBAND = "disband",
    /** `{ mode }` — chủ đổi cách chia item (`PartyLootMode`). */
    SET_LOOT = "setLoot",
}

/** Message server → client của party room (ngoài state). */
export enum PartyMessage {
    /** Sự kiện (`data.notice`) hoặc lỗi thao tác (`code`) — client dịch sang thông báo. */
    NOTICE = "notice",
    /** Chủ bấm vào dungeon nhưng có người không đủ điều kiện — không ai vào. `Result` thất bại `DUNGEON_DENIED`, `error` là `PartyDungeonDeniedMessage`. */
    DUNGEON_DENIED = "dungeonDenied",
}

/**
 * Thông báo thành công (sự kiện) của party — `data.notice` của `PartyMessage.NOTICE`. Lỗi thao tác không nằm
 * ở đây mà là `Result` thất bại với `ErrorCode` (`PARTY_*`).
 */
export enum PartyNotice {
    INVITE_SENT = "invite_sent",
    INVITE_DECLINED = "invite_declined",
    INVITE_EXPIRED = "invite_expired",
    MEMBER_JOINED = "member_joined",
    MEMBER_LEFT = "member_left",
    KICKED = "kicked",
    LEADER_CHANGED = "leader_changed",
    DISBANDED = "disbanded",
    /** Xin vào party: đã gửi tới chủ party. */
    JOIN_REQUEST_SENT = "join_request_sent",
}

/** `data` của `PartyMessage.NOTICE` khi thành công; khi thất bại `error` mang `playerName` (nếu có). */
export interface PartyNoticeMessage {
    notice: PartyNotice;
    /** Người liên quan (được mời, rời, bị kick, chủ mới...). */
    playerName?: string;
}

export interface PartyDungeonFailureMessage {
    playerId: string;
    name: string;
    /** Mã lỗi (`ErrorCode`): `LEVEL_TOO_LOW`, `PLAYER_OFFLINE`, `PLAYER_DEAD` hoặc `DUNGEON_ALREADY_IN`. */
    reason: string;
}

export interface PartyDungeonDeniedMessage {
    dungeonCode: string;
    failures: PartyDungeonFailureMessage[];
}
