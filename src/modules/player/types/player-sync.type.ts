import type { PlayerDataGroup } from "@/modules/player/enums/player-state.enum.js";
import type { PlayerChangeOp } from "@/modules/player/types/player-change.type.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type {
    PlayerExtras,
    PlayerPartyState,
    PlayerPresence,
} from "@/modules/player/types/player-state.type.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";

/**
 * Giữa world và global ở hai process khác nhau: global giữ dữ liệu chính của player, world giữ một bản sao đọc (replica) và chỉ
 * gửi lên global những thay đổi dưới dạng dữ liệu JSON bên dưới. Mọi kiểu ở đây phải serialize được.
 */

/** Giá trị các cột của một nhóm (`PLAYER_GROUP_COLUMNS`). */
export type PlayerGroupData = Partial<PlayerSavedState>;

/** Toàn bộ dữ liệu world cần để dựng bản sao của một player. */
export interface PlayerReplicaSnapshot {
    name: string;
    classId: string;
    classCode: string;
    data: PlayerSavedState;
    extras: PlayerExtras;
    party?: PlayerPartyState;
}

export interface PlayerAttachRequest {
    playerId: string;
    worldRoomId: string;
}

/**
 * Một lần ghi từ world lên global. `eventId` làm cho việc gửi lại (timeout ≠ chưa chạy) không áp hai lần: global nhớ kết quả
 * của các `eventId` gần nhất. Trừ tiền / kiểm tra lô thao tác thất bại thì không đổi gì (cả lô cùng thành công).
 */
export interface PlayerWriteRequest {
    playerId: string;
    worldRoomId: string;
    eventId: string;
    credit?: CurrencyReward[];
    debit?: CurrencyReward[];
    ops?: PlayerChangeOp[];
}

/** Kết quả một lần ghi: `groups` là giá trị mới nhất của các nhóm global vừa đổi (bản sao đối soát theo đó). */
export interface PlayerWriteAck {
    groups: Partial<Record<PlayerDataGroup, PlayerGroupData>>;
}

/** `errorData` của lần ghi bị global từ chối: giá trị thật của ví / túi để bản sao bỏ phần đã áp thử. */
export type PlayerWriteRejection = {
    groups: Partial<Record<PlayerDataGroup, PlayerGroupData>>;
};

/** Sao lưu dữ liệu đổi liên tục (và tiến độ sửa tại chỗ) của world lên global; `flush` = lưu DB ngay (đổi map, rời room). */
export interface PlayerSyncRequest {
    playerId: string;
    worldRoomId: string;
    progress?: PlayerGroupData;
    place?: PlayerGroupData;
    flush?: boolean;
}

export interface PlayerPresenceRequest {
    playerId: string;
    worldRoomId: string;
    /** `undefined` = world rời (kèm `changingMap`). */
    presence?: PlayerPresence;
    changingMap?: boolean;
}

export interface PlayerDetachRequest {
    playerId: string;
    worldRoomId: string;
}

/** Global báo world: một nhóm dữ liệu vừa đổi ở global (ví, túi...) — kèm giá trị mới. */
export interface PlayerGroupChanged {
    playerId: string;
    group: PlayerDataGroup;
    data: PlayerGroupData;
}

/** Global báo world: party của player đổi (`undefined` = rời party). */
export interface PlayerPartyChanged {
    playerId: string;
    party?: PlayerPartyState;
}
