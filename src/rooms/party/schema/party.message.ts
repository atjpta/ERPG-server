import type { PartyDungeonDenyReason } from "@/modules/party/schemas/party.schema.js";

/*
 * Payload message của party room — `yarn schema:generate` sinh C# (xem ghi chú ở world.message.ts:
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
    /** Sự kiện / lỗi thao tác — client dịch `code` sang thông báo. */
    NOTICE = "notice",
    /** Chủ bấm vào dungeon nhưng có người không đủ điều kiện — không ai vào. */
    DUNGEON_DENIED = "dungeonDenied",
}

export enum PartyNoticeCode {
    INVITE_SENT = "invite_sent",
    INVITE_DECLINED = "invite_declined",
    INVITE_EXPIRED = "invite_expired",
    MEMBER_JOINED = "member_joined",
    MEMBER_LEFT = "member_left",
    KICKED = "kicked",
    LEADER_CHANGED = "leader_changed",
    DISBANDED = "disbanded",
    NOT_LEADER = "not_leader",
    PARTY_FULL = "party_full",
    TARGET_OFFLINE = "target_offline",
    TARGET_NOT_FOUND = "target_not_found",
    TARGET_IN_PARTY = "target_in_party",
    SELF_TARGET = "self_target",
    ALREADY_MEMBER = "already_member",
    NOT_MEMBER = "not_member",
    INVITE_LIMIT = "invite_limit",
}

export interface PartyNoticeMessage {
    code: PartyNoticeCode;
    /** Người liên quan (được mời, rời, bị kick, chủ mới...). */
    playerName?: string;
}

export interface PartyDungeonFailureMessage {
    playerId: string;
    name: string;
    reason: PartyDungeonDenyReason;
}

export interface PartyDungeonDeniedMessage {
    dungeonCode: string;
    failures: PartyDungeonFailureMessage[];
}
