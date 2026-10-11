import {
    type PartyConfig,
    type PartyLootMode,
    type PartyMemberInfo,
} from "@/modules/party/schemas/party.schema.js";
import {
    checkPartyDungeonEntry,
    nextLeader,
    type DungeonEntryFailure,
} from "@/modules/party/utils/party-rules.util.js";

/** Lỗi thao tác party (gửi cho client dưới dạng notice). */
export enum PartyError {
    NOT_LEADER = "not_leader",
    PARTY_FULL = "party_full",
    SELF_TARGET = "self_target",
    ALREADY_MEMBER = "already_member",
    NOT_MEMBER = "not_member",
}

export interface PartyInvite {
    fromName: string;
    /** Thông tin người được mời lúc gửi lời mời (world room trả về) — dùng tạo thành viên khi họ vào. */
    snapshot: PartyMemberInfo;
    expiresAt: number;
}

export interface LeaveResult {
    /** Chủ mới nếu chủ vừa rời. */
    newLeaderId?: string;
    /** Party hết người. */
    empty: boolean;
}

/**
 * Trạng thái party thuần (không phụ thuộc Colyseus / DB): thành viên theo thứ tự vào, chủ, lời mời còn hạn.
 * `PartyRoom` bọc lớp này và đồng bộ ra Schema; mọi luật nằm ở đây để test được.
 */
export class PartyModel {
    readonly members = new Map<string, PartyMemberInfo>();
    leaderId: string;
    lootMode: PartyLootMode;
    private readonly invites = new Map<string, PartyInvite>();

    constructor(
        readonly config: PartyConfig,
        leader: PartyMemberInfo
    ) {
        this.members.set(leader.playerId, leader);
        this.leaderId = leader.playerId;
        this.lootMode = config.lootMode;
    }

    get size() {
        return this.members.size;
    }

    get joinOrder(): string[] {
        return [...this.members.keys()];
    }

    has(playerId: string) {
        return this.members.has(playerId);
    }

    isLeader(playerId: string) {
        return this.leaderId === playerId;
    }

    /** Chủ có mời được `targetId` không (chưa tính online / party khác — phần đó do room kiểm). */
    canInvite(byId: string, targetId: string, nowMs: number): PartyError | undefined {
        if (!this.isLeader(byId)) return PartyError.NOT_LEADER;
        if (byId === targetId) return PartyError.SELF_TARGET;
        if (this.has(targetId)) return PartyError.ALREADY_MEMBER;
        // Lời mời còn hạn cũng giữ chỗ, tránh mời quá số chỗ.
        this.pruneInvites(nowMs);
        const pending = [...this.invites.keys()].filter((id) => id !== targetId).length;
        if (this.size + pending >= this.config.maxMembers) return PartyError.PARTY_FULL;
        return undefined;
    }

    addInvite(targetId: string, invite: PartyInvite) {
        this.invites.set(targetId, invite);
    }

    peekInvite(targetId: string, nowMs: number): PartyInvite | undefined {
        const invite = this.invites.get(targetId);
        return invite && invite.expiresAt > nowMs ? invite : undefined;
    }

    removeInvite(targetId: string): PartyInvite | undefined {
        const invite = this.invites.get(targetId);
        this.invites.delete(targetId);
        return invite;
    }

    /** Xoá lời mời hết hạn, trả về `[playerId, invite]` đã hết hạn. */
    pruneInvites(nowMs: number): [string, PartyInvite][] {
        const expired = [...this.invites].filter(([, invite]) => invite.expiresAt <= nowMs);
        for (const [playerId] of expired) this.invites.delete(playerId);
        return expired;
    }

    /** Vào party bằng lời mời còn hạn (tiêu thụ lời mời). */
    joinWithInvite(playerId: string, nowMs: number): PartyError | "no_invite" | undefined {
        if (this.has(playerId)) return PartyError.ALREADY_MEMBER;
        const invite = this.peekInvite(playerId, nowMs);
        if (!invite) return "no_invite";
        if (this.size >= this.config.maxMembers) return PartyError.PARTY_FULL;
        this.invites.delete(playerId);
        this.members.set(playerId, { ...invite.snapshot, inWorld: true });
        return undefined;
    }

    /** Rời party (tự rời, bị kick, offline): chuyển chủ cho người vào sớm nhất nếu chủ rời. */
    leave(playerId: string): LeaveResult {
        const wasLeader = this.isLeader(playerId);
        const order = this.joinOrder;
        this.members.delete(playerId);
        if (this.size === 0) return { empty: true };
        if (!wasLeader) return { empty: false };
        const next = nextLeader(order, playerId)!;
        this.leaderId = next;
        return { empty: false, newLeaderId: next };
    }

    kick(byId: string, targetId: string): PartyError | undefined {
        if (!this.isLeader(byId)) return PartyError.NOT_LEADER;
        if (byId === targetId) return PartyError.SELF_TARGET;
        if (!this.has(targetId)) return PartyError.NOT_MEMBER;
        this.leave(targetId);
        return undefined;
    }

    promote(byId: string, targetId: string): PartyError | undefined {
        if (!this.isLeader(byId)) return PartyError.NOT_LEADER;
        if (byId === targetId) return PartyError.SELF_TARGET;
        if (!this.has(targetId)) return PartyError.NOT_MEMBER;
        this.leaderId = targetId;
        return undefined;
    }

    setLootMode(byId: string, mode: PartyLootMode): PartyError | undefined {
        if (!this.isLeader(byId)) return PartyError.NOT_LEADER;
        this.lootMode = mode;
        return undefined;
    }

    patch(playerId: string, patch: Partial<Omit<PartyMemberInfo, "playerId">>) {
        const member = this.members.get(playerId);
        if (member) Object.assign(member, patch);
    }

    /** Chủ muốn vào dungeon: danh sách người không đạt (rỗng = cả party được vào). */
    checkDungeon(minLevel: number, capacity: number): DungeonEntryFailure[] {
        return checkPartyDungeonEntry([...this.members.values()], {
            minLevel,
            capacity,
            leaderId: this.leaderId,
        });
    }
}
