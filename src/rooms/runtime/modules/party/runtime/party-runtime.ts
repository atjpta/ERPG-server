import type { ErrorCode } from "@/core/types/result.type.js";
import type { PartyInvite } from "@/rooms/runtime/modules/party/types/party-invite.type.js";
import { PartyLootMode } from "@/modules/master-data/enums/party-loot-mode.enum.js";
import type { PartyConfig } from "@/modules/master-data/schemas/party-config.schema.js";
import { PartyErrorCode } from "@/rooms/runtime/modules/party/enums/party-error-code.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";

/**
 * Một party đang sống trong bộ nhớ server (dữ liệu runtime của process, do global room quản lý), kèm mọi luật của party (thứ tự vào,
 * đổi chủ, chỗ trống, lời mời). Chỉ giữ danh sách thành viên và chủ, không giữ level / HP / vị trí.
 */
export class PartyRuntime {
    readonly id: string;
    leaderPlayerId: string;
    /** Cách chia item. */
    lootMode: PartyLootMode;
    /** Thành viên theo thứ tự vào party. */
    /** playerId → tên hiển thị, theo thứ tự vào party. */
    readonly members = new Map<string, string>();
    readonly config: PartyConfig;
    disbanded = false;
    /** Đang chạy quy trình vào dungeon của cả party: yêu cầu thứ hai bị từ chối thay vì chạy song song. */
    launching = false;
    /** playerId → lúc (đồng hồ room) bắt đầu không còn vị trí trong world; quá `PARTY_OFFLINE_KICK_MS` thì bị rút khỏi party. */
    readonly offlineSince = new Map<string, number>();
    private readonly invites = new Map<string, PartyInvite>();

    constructor(id: string, leader: { playerId: string; name: string }) {
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

    /** Đổi tên hiển thị của thành viên; `false` nếu người đó không ở party. */
    renameMember(playerId: string, name: string): boolean {
        if (!this.members.has(playerId)) return false;
        this.members.set(playerId, name);
        return true;
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

    /** Thao tác của chủ (kick / promote) lên một thành viên khác có hợp lệ không. */
    checkTarget(byId: string, targetId: string): ErrorCode | undefined {
        if (!this.isLeader(byId)) return PartyErrorCode.PARTY_NOT_LEADER;
        if (byId === targetId) return PartyErrorCode.PARTY_SELF_TARGET;
        if (!this.hasMember(targetId)) return PartyErrorCode.PARTY_NOT_MEMBER;
        return undefined;
    }
}
