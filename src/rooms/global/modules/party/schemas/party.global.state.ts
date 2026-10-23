import { Schema } from "@colyseus/schema";
import type { ErrorCode } from "@/core/types/result.type.js";
import type { PartyInvite } from "@/rooms/global/modules/party/types/party-invite.type.js";
import {
    PartyLootMode,
    type PartyConfig,
} from "@/rooms/global/modules/party/types/party-member.type.js";
import type { PartyStateMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { PartyErrorCode } from "@/rooms/global/modules/party/enums/party-error-code.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";

/**
 * Một party đang sống trong global room — state chỉ ở server (không field `@type` nên không sync cho client; client
 * nhận `PartyStateMessage` qua `toMessage()`), kèm mọi luật của party (thứ tự vào, đổi chủ, chỗ trống, lời mời).
 * Chỉ giữ danh sách thành viên và chủ, không giữ level / HP / vị trí.
 */
export class PartyState extends Schema {
    readonly id: string;
    leaderPlayerId: string;
    /** Cách chia item. */
    lootMode: PartyLootMode;
    /** Thành viên theo thứ tự vào party. */
    /** playerId → tên hiển thị, theo thứ tự vào party. */
    readonly members = new Map<string, string>();
    readonly config: PartyConfig;
    /** Bộ đếm chung cho snapshot lúc attach và thông báo membership: world so sánh để bỏ qua bản cũ. */
    revision = 0;
    disbanded = false;
    /** Đang chạy quy trình vào dungeon của cả party: yêu cầu thứ hai bị từ chối thay vì chạy song song. */
    launching = false;
    /** playerId → lúc (đồng hồ room) bắt đầu không còn vị trí trong world; quá `PARTY_OFFLINE_KICK_MS` thì bị rút khỏi party. */
    readonly offlineSince = new Map<string, number>();
    private readonly invites = new Map<string, PartyInvite>();

    constructor(id: string, leader: { playerId: string; name: string }) {
        super();
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        this.id = id;
        this.config = config;
        this.lootMode = config.lootMode;
        this.leaderPlayerId = leader.playerId;
        this.members.set(leader.playerId, leader.name);
    }

    get size() {
        return this.members.size;
    }

    /** Thứ tự vào party (dùng để chia luân phiên và chọn chủ mới). */
    get joinOrder(): string[] {
        return [...this.members.keys()];
    }

    getMemberName(playerId: string) {
        return this.members.get(playerId) ?? "";
    }

    hasMember(playerId: string) {
        return this.members.has(playerId);
    }

    isLeader(playerId: string) {
        return this.leaderPlayerId === playerId;
    }

    /**
     * Chủ `byId` mời `targetId`: kiểm tra (chủ, không tự mời, chưa là thành viên, còn chỗ) rồi thêm lời mời luôn.
     * Trả mã lỗi nếu không mời được. Chưa tính online / đang ở party khác — phần đó do command kiểm.
     */
    addInvite(byId: string, targetId: string, invite: PartyInvite): ErrorCode | undefined {
        if (!this.isLeader(byId)) return PartyErrorCode.PARTY_NOT_LEADER;
        if (byId === targetId) return PartyErrorCode.PARTY_SELF_TARGET;
        if (this.hasMember(targetId)) return PartyErrorCode.PARTY_ALREADY_MEMBER;
        if (!this.hasRoomFor(targetId)) return PartyErrorCode.PARTY_FULL;
        this.invites.set(targetId, invite);
        return undefined;
    }

    /** Còn chỗ cho `targetId` không (lời mời đang chờ của người khác cũng giữ chỗ, tránh mời quá số chỗ). */
    hasRoomFor(targetId: string): boolean {
        const pending = [...this.invites.keys()].filter((id) => id !== targetId).length;
        return this.size + pending < this.config.maxMembers;
    }

    removeInvite(targetId: string): PartyInvite | undefined {
        const invite = this.invites.get(targetId);
        this.invites.delete(targetId);
        return invite;
    }

    /** Vào party bằng lời mời đang chờ (tiêu thụ lời mời; lời mời hết hạn đã bị timer xoá nên không còn ở đây). */
    joinWithInvite(playerId: string): ErrorCode | undefined {
        if (this.hasMember(playerId)) return PartyErrorCode.PARTY_ALREADY_MEMBER;
        const invite = this.invites.get(playerId);
        if (!invite) return PartyErrorCode.PARTY_NO_INVITE;
        if (this.size >= this.config.maxMembers) return PartyErrorCode.PARTY_FULL;
        this.invites.delete(playerId);
        this.members.set(playerId, invite.targetName);
        return undefined;
    }

    /**
     * Rời party (tự rời, bị kick, offline). Nếu chủ rời, chuyển chủ cho người vào sớm nhất còn lại và
     * trả về chủ mới; ngược lại (hoặc party hết người) trả `undefined`.
     */
    leave(playerId: string): string | undefined {
        const wasLeader = this.isLeader(playerId);
        this.members.delete(playerId);
        if (!wasLeader || this.size === 0) return undefined;
        this.leaderPlayerId = this.joinOrder[0];
        return this.leaderPlayerId;
    }

    promote(byId: string, targetId: string): ErrorCode | undefined {
        const error = this.checkTarget(byId, targetId);
        if (!error) this.leaderPlayerId = targetId;
        return error;
    }

    setLootMode(byId: string, mode: PartyLootMode): ErrorCode | undefined {
        if (!this.isLeader(byId)) return PartyErrorCode.PARTY_NOT_LEADER;
        this.lootMode = mode;
        return undefined;
    }

    /** Snapshot gửi cho client (thành viên theo thứ tự vào party). */
    toMessage(): PartyStateMessage {
        return {
            partyId: this.id,
            leaderPlayerId: this.leaderPlayerId,
            lootMode: this.lootMode,
            members: [...this.members].map(([playerId, name]) => ({ playerId, name })),
        };
    }

    /** Thao tác của chủ (kick / promote) lên một thành viên khác có hợp lệ không. */
    checkTarget(byId: string, targetId: string): ErrorCode | undefined {
        if (!this.isLeader(byId)) return PartyErrorCode.PARTY_NOT_LEADER;
        if (byId === targetId) return PartyErrorCode.PARTY_SELF_TARGET;
        if (!this.hasMember(targetId)) return PartyErrorCode.PARTY_NOT_MEMBER;
        return undefined;
    }
}
