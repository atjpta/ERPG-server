import type { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import type { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";

/* DTO party gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

/** Một thành viên trong `PartyStateMessage`. Level, HP... của thành viên cùng map đọc từ state world theo `playerId`. */
export interface PartyMemberMessage {
    playerId: string;
    name: string;
}

/** Snapshot đầy đủ của party; `members` theo thứ tự vào party. */
export interface PartyStateMessage {
    partyId: string;
    leaderPlayerId: string;
    /** Cách chia item. */
    lootMode: PartyLootMode;
    members: PartyMemberMessage[];
}

/** `data` của `GlobalMessage.PARTY_LEFT`. */
export interface PartyLeftMessage {
    partyId: string;
}

/** `data` của `GlobalMessage.PARTY_NOTICE` (và response `partyInvite` / `partyRequestJoin`); khi thất bại `error` mang `playerName` (nếu có). */
export interface PartyNoticeMessage {
    notice: PartyNotice;
    /** Người liên quan (được mời, rời, bị kick, chủ mới...). */
    playerName?: string;
}

export interface PartyInviteReceivedMessage {
    /** Lời mời sinh ra từ một yêu cầu xin vào: người nhận vào luôn, không cần bấm đồng ý. */
    autoAccept?: boolean;
    partyId: string;
    fromName: string;
    expiresInSec: number;
}

export interface PartyJoinRequestMessage {
    partyId: string;
    fromName: string;
    expiresInSec: number;
}
