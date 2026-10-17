import { PartyMemberState } from "@/rooms/party/modules/members/schemas/member.party.state.js";
import {
    PartyDungeonDenyReason,
    PartyLootMode,
    type PartyConfig,
    type PartyMemberInfo,
} from "@/rooms/party/schemas/party.schema.js";
import type { PartyInvite } from "@/rooms/party/types/party-invite.type.js";
import type { DungeonFailure } from "@/rooms/party/types/party-room.type.js";
import { MapSchema, Schema, type } from "@colyseus/schema";

/** Lỗi thao tác party (gửi cho client dưới dạng notice). */
export enum PartyError {
    NOT_LEADER = "not_leader",
    PARTY_FULL = "party_full",
    SELF_TARGET = "self_target",
    ALREADY_MEMBER = "already_member",
    NOT_MEMBER = "not_member",
}

/**
 * State của party room: phần có `@type` được đồng bộ cho client; `config` và lời mời chỉ ở server.
 * Mọi luật (thứ tự vào, đổi chủ, chỗ trống, điều kiện dungeon) nằm ở đây.
 */
export class PartyState extends Schema {
    @type("string") leaderPlayerId = "";
    /** Cách chia item. */
    @type("string") lootMode: PartyLootMode = PartyLootMode.KILLER;
    @type({ map: PartyMemberState }) members = new MapSchema<PartyMemberState>();

    config!: PartyConfig;
    private readonly invites = new Map<string, PartyInvite>();

    init(config: PartyConfig, leader: PartyMemberInfo) {
        this.config = config;
        this.lootMode = config.lootMode;
        this.leaderPlayerId = leader.playerId;
        this.members.set(leader.playerId, new PartyMemberState(leader));
    }

    get size() {
        return this.members.size;
    }

    /** Thứ tự vào party (dùng để chia luân phiên và chọn chủ mới). */
    get joinOrder(): string[] {
        return [...this.members.keys()];
    }

    nameOf(playerId: string) {
        return this.members.get(playerId)?.name ?? "";
    }

    has(playerId: string) {
        return this.members.has(playerId);
    }

    isLeader(playerId: string) {
        return this.leaderPlayerId === playerId;
    }

    /** Chủ có mời được `targetId` không (chưa tính online / party khác — phần đó do command kiểm). */
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
        const invite = this.invites.get(playerId);
        if (!invite || invite.expiresAt <= nowMs) return "no_invite";
        if (this.size >= this.config.maxMembers) return PartyError.PARTY_FULL;
        this.invites.delete(playerId);
        this.members.set(playerId, new PartyMemberState({ ...invite.snapshot, inWorld: true }));
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

    promote(byId: string, targetId: string): PartyError | undefined {
        const error = this.checkTarget(byId, targetId);
        if (!error) this.leaderPlayerId = targetId;
        return error;
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

    /**
     * Chủ muốn vào dungeon (all-or-nothing): danh sách người không đạt, rỗng = cả party được vào. Mỗi người
     * một lý do (ưu tiên: ngoài world > đang trong dungeon > chết > thiếu level).
     */
    checkDungeon(minLevel: number): DungeonFailure[] {
        const failures: DungeonFailure[] = [];
        for (const { playerId, name, inWorld, inDungeon, hp, level } of this.members.values()) {
            const reason = !inWorld
                ? PartyDungeonDenyReason.OFFLINE
                : inDungeon
                  ? PartyDungeonDenyReason.IN_DUNGEON
                  : hp <= 0
                    ? PartyDungeonDenyReason.DEAD
                    : level < minLevel
                      ? PartyDungeonDenyReason.LEVEL_TOO_LOW
                      : undefined;
            if (reason) failures.push({ playerId, name, reason });
        }
        return failures;
    }

    /** Thao tác của chủ (kick / promote) lên một thành viên khác có hợp lệ không. */
    checkTarget(byId: string, targetId: string): PartyError | undefined {
        if (!this.isLeader(byId)) return PartyError.NOT_LEADER;
        if (byId === targetId) return PartyError.SELF_TARGET;
        if (!this.has(targetId)) return PartyError.NOT_MEMBER;
        return undefined;
    }
}
