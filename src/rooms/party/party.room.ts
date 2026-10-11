import { randomUUID } from "node:crypto";
import { matchMaker } from "colyseus";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { playerService } from "@/modules/player/user/services/player.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { PartyError, PartyModel } from "@/modules/party/party.model.js";
import type { PartyLootMode, PartyMemberInfo } from "@/modules/party/schemas/party.schema.js";
import { partyDirectoryService } from "@/modules/party/services/party-directory.service.js";
import { BasePlayerRoom, type PlayerClient } from "@/rooms/base/base-player.room.js";
import { worldRemote } from "@/rooms/party/party-remote.util.js";
import {
    PartyClientMessage,
    PartyMessage,
    PartyNoticeCode,
    type PartyDungeonDeniedMessage,
    type PartyNoticeMessage,
} from "@/rooms/party/schema/party.message.js";
import { PartyMemberState, PartyState } from "@/rooms/party/schema/party.state.js";
import {
    PartyInviteSchema,
    PartyLootSchema,
    PartyTargetSchema,
} from "@/rooms/party/validators/party.validator.js";

export interface PartyRoomOptions {
    /** Chủ lúc tạo (snapshot từ world room). */
    leader: PartyMemberInfo;
    leaderWorldRoomId: string;
}

const NOTICE_BY_ERROR: Record<PartyError, PartyNoticeCode> = {
    [PartyError.NOT_LEADER]: PartyNoticeCode.NOT_LEADER,
    [PartyError.PARTY_FULL]: PartyNoticeCode.PARTY_FULL,
    [PartyError.SELF_TARGET]: PartyNoticeCode.SELF_TARGET,
    [PartyError.ALREADY_MEMBER]: PartyNoticeCode.ALREADY_MEMBER,
    [PartyError.NOT_MEMBER]: PartyNoticeCode.NOT_MEMBER,
};

/**
 * Một party = một room. Thành viên = người đang có kết nối party; mất kết nối / rời / bị kick là ra khỏi
 * party ngay (không giữ chỗ). Hết người thì room tự đóng. Luật nằm ở `PartyModel`, room chỉ nối I/O.
 */
export class PartyRoom extends BasePlayerRoom<{ state: PartyState; client: PlayerClient }> {
    state = new PartyState();

    private model!: PartyModel;
    private serverId = "";
    /** playerId → sessionId của kết nối party. */
    private readonly sessionOf = new Map<string, string>();
    /** playerId → world room đang đứng (để gọi lệnh). */
    private readonly worldRoomOf = new Map<string, string>();
    private disbanded = false;

    messages = {
        [PartyClientMessage.INVITE]: (client: PlayerClient, payload: unknown) => {
            void this.handleInvite(client, payload);
        },
        [PartyClientMessage.KICK]: (client: PlayerClient, payload: unknown) => {
            void this.handleKickMember(client, payload);
        },
        [PartyClientMessage.PROMOTE]: (client: PlayerClient, payload: unknown) => {
            this.handlePromote(client, payload);
        },
        [PartyClientMessage.LEAVE]: (client: PlayerClient) => {
            void this.removePlayer(client.auth.playerId, PartyNoticeCode.MEMBER_LEFT);
        },
        [PartyClientMessage.DISBAND]: (client: PlayerClient) => {
            void this.handleDisband(client);
        },
        [PartyClientMessage.SET_LOOT]: (client: PlayerClient, payload: unknown) => {
            this.handleSetLoot(client, payload);
        },
    };

    async onCreate(options: PartyRoomOptions) {
        const config = masterDataCacheService.get(MasterDataKey.PARTY_CONFIG);
        this.maxClients = config.maxMembers;
        this.model = new PartyModel(config, { ...options.leader, inWorld: true });
        this.worldRoomOf.set(options.leader.playerId, options.leaderWorldRoomId);
        this.serverId = (
            await playerService.assertPlayableOrFail(options.leader.playerId)
        ).serverId;
        // Hết hạn lời mời.
        this.clock.setInterval(() => this.expireInvites(), 1000);
        this.syncState();
    }

    async onJoin(client: PlayerClient) {
        const { playerId } = client.auth;
        if (this.sessionOf.has(playerId)) throw new Error("Already connected to this party");

        const isFounder = this.model.has(playerId);
        if (!isFounder) {
            const existing = await partyDirectoryService.getPartyRoomId(playerId);
            if (existing && existing !== this.roomId) throw new Error("Already in another party");
            const error = this.model.joinWithInvite(playerId, this.clock.currentTime);
            if (error) throw new Error(`Cannot join party: ${error}`);
        }
        this.sessionOf.set(playerId, client.sessionId);
        // Room phụ: không đá kết nối world cùng player.
        await this.registerOnlinePlayer(client, { kickDuplicateLogins: false });
        await partyDirectoryService.setPartyRoomId(playerId, this.roomId);

        const worldRoomId =
            this.worldRoomOf.get(playerId) ??
            (await partyDirectoryService.getWorldRoomId(playerId));
        if (worldRoomId) {
            this.worldRoomOf.set(playerId, worldRoomId);
            void worldRemote.setPlayerParty(
                worldRoomId,
                playerId,
                this.roomId,
                this.model.lootMode
            );
        }
        this.syncState();
        if (!isFounder) {
            this.broadcastNotice(PartyNoticeCode.MEMBER_JOINED, this.nameOf(playerId), playerId);
        }
    }

    async onLeave(client: PlayerClient) {
        await this.unregisterOnlinePlayer(client);
        // Không allowReconnection: rớt kết nối là rời party ngay.
        if (this.sessionOf.get(client.auth.playerId) === client.sessionId) {
            await this.removePlayer(client.auth.playerId, PartyNoticeCode.MEMBER_LEFT, false);
        }
    }

    // ---- Gọi từ world room qua matchMaker.remoteRoomCall --------------------------------------

    /** World room mới báo thành viên đã vào (đổi map / vào dungeon). */
    attachWorld(
        playerId: string,
        worldRoomId: string,
        info?: Partial<PartyMemberInfo>
    ): PartyLootMode | null {
        if (!this.model?.has(playerId)) return null;
        this.worldRoomOf.set(playerId, worldRoomId);
        this.model.patch(playerId, { ...info, inWorld: true });
        this.syncState();
        return this.model.lootMode;
    }

    /** World room cũ báo thành viên đã rời; chỉ tính khi room đó còn là room hiện tại của họ. */
    detachWorld(playerId: string, worldRoomId: string) {
        if (!this.model?.has(playerId) || this.worldRoomOf.get(playerId) !== worldRoomId) return;
        this.worldRoomOf.delete(playerId);
        this.model.patch(playerId, { inWorld: false });
        this.syncState();
    }

    /** Người chơi offline thật (không phải đổi map): ra khỏi party ngay. */
    removeMember(playerId: string) {
        return this.removePlayer(playerId, PartyNoticeCode.MEMBER_LEFT);
    }

    /** World room báo HP / level / map thành viên (gộp, tối đa ~1 lần/giây). */
    report(updates: (Pick<PartyMemberInfo, "playerId"> & Partial<PartyMemberInfo>)[]) {
        for (const { playerId, ...patch } of updates) this.model?.patch(playerId, patch);
        this.syncState();
    }

    declineInvite(playerId: string) {
        const invite = this.model?.removeInvite(playerId);
        if (invite) this.notifyLeader(PartyNoticeCode.INVITE_DECLINED, invite.snapshot.name);
    }

    /**
     * Chủ muốn vào dungeon. Có ai không đạt → báo cả party, không ai vào. Đạt hết → tạo instance và ra lệnh
     * cho world room của từng thành viên. Trả `{ ok }` cho world room của chủ.
     */
    async requestDungeon(
        leaderPlayerId: string,
        dungeon: { code: string; minLevel: number; spawnId: string }
    ): Promise<{ ok: boolean; error?: string }> {
        if (!this.model.isLeader(leaderPlayerId)) return { ok: false, error: "not_leader" };
        const failures = this.model.checkDungeon(dungeon.minLevel);
        if (failures.length > 0) {
            this.broadcastDenied(dungeon.code, failures);
            return { ok: false, error: "denied" };
        }
        const instanceId = randomUUID();
        const expected = this.model.joinOrder;
        await partyDirectoryService.setDungeonExpectation(instanceId, {
            dungeonCode: dungeon.code,
            leaderPlayerId,
            expected,
        });
        const results = await Promise.all(
            expected.map(async (playerId) => {
                const worldRoomId = this.worldRoomOf.get(playerId);
                const error = worldRoomId
                    ? await worldRemote.enterDungeon(
                          worldRoomId,
                          playerId,
                          dungeon.code,
                          instanceId,
                          dungeon.spawnId
                      )
                    : "offline";
                return { playerId, error };
            })
        );
        const failed = results.filter((result) => result.error);
        if (failed.length > 0) {
            this.broadcastDenied(
                dungeon.code,
                failed.map((result) => ({
                    playerId: result.playerId,
                    name: this.nameOf(result.playerId),
                    reason: toDenyReason(result.error!),
                }))
            );
        }
        return { ok: failed.length === 0 };
    }

    // ---- Xử lý message client -----------------------------------------------------------------

    private async handleInvite(client: PlayerClient, payload: unknown) {
        const parsed = PartyInviteSchema.safeParse(payload);
        if (!parsed.success) return;
        const leaderId = client.auth.playerId;
        if (!this.model.isLeader(leaderId)) return this.notice(client, PartyNoticeCode.NOT_LEADER);
        if (!(await partyDirectoryService.allowInvite(leaderId))) {
            return this.notice(client, PartyNoticeCode.INVITE_LIMIT);
        }
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: this.serverId,
            name: parsed.data.playerName,
        });
        if (!target) return this.notice(client, PartyNoticeCode.TARGET_NOT_FOUND);

        const now = this.clock.currentTime;
        const error = this.model.canInvite(leaderId, target.id, now);
        if (error) return this.notice(client, NOTICE_BY_ERROR[error], target.name);

        const existing = await partyDirectoryService.getPartyRoomId(target.id);
        if (existing && (await this.isRoomAlive(existing))) {
            return this.notice(client, PartyNoticeCode.TARGET_IN_PARTY, target.name);
        }
        const worldRoomId = await partyDirectoryService.getWorldRoomId(target.id);
        if (!worldRoomId) return this.notice(client, PartyNoticeCode.TARGET_OFFLINE, target.name);

        const ttlSec = this.model.config.inviteTtlSec;
        const snapshot = await worldRemote.deliverInvite(worldRoomId, target.id, {
            partyRoomId: this.roomId,
            fromName: this.nameOf(leaderId),
            expiresInSec: ttlSec,
        });
        if (!snapshot) return this.notice(client, PartyNoticeCode.TARGET_OFFLINE, target.name);

        this.model.addInvite(target.id, {
            fromName: this.nameOf(leaderId),
            snapshot,
            expiresAt: this.clock.currentTime + ttlSec * 1000,
        });
        this.worldRoomOf.set(target.id, worldRoomId);
        this.notice(client, PartyNoticeCode.INVITE_SENT, target.name);
    }

    private async handleKickMember(client: PlayerClient, payload: unknown) {
        const parsed = PartyTargetSchema.safeParse(payload);
        if (!parsed.success) return;
        const targetId = parsed.data.playerId;
        const name = this.nameOf(targetId);
        const error = this.model.kick(client.auth.playerId, targetId);
        if (error) return this.notice(client, NOTICE_BY_ERROR[error], name);
        // `kick` đã bỏ khỏi model: dọn phần còn lại giống rời party.
        await this.afterRemoved(targetId, PartyNoticeCode.KICKED, name, true);
    }

    private handlePromote(client: PlayerClient, payload: unknown) {
        const parsed = PartyTargetSchema.safeParse(payload);
        if (!parsed.success) return;
        const error = this.model.promote(client.auth.playerId, parsed.data.playerId);
        if (error)
            return this.notice(client, NOTICE_BY_ERROR[error], this.nameOf(parsed.data.playerId));
        this.syncState();
        this.broadcastNotice(PartyNoticeCode.LEADER_CHANGED, this.nameOf(parsed.data.playerId));
    }

    private handleSetLoot(client: PlayerClient, payload: unknown) {
        const parsed = PartyLootSchema.safeParse(payload);
        if (!parsed.success) return;
        const error = this.model.setLootMode(client.auth.playerId, parsed.data.mode);
        if (error) return this.notice(client, NOTICE_BY_ERROR[error]);
        this.syncState();
        // World room của từng thành viên cần biết cách chia mới để chia item lúc hạ quái.
        for (const [playerId, worldRoomId] of this.worldRoomOf) {
            void worldRemote.setPlayerParty(
                worldRoomId,
                playerId,
                this.roomId,
                this.model.lootMode
            );
        }
    }

    private async handleDisband(client: PlayerClient) {
        if (!this.model.isLeader(client.auth.playerId)) {
            return this.notice(client, PartyNoticeCode.NOT_LEADER);
        }
        this.disbanded = true;
        this.broadcastNotice(PartyNoticeCode.DISBANDED);
        for (const playerId of this.model.joinOrder) {
            await this.release(playerId);
        }
        this.clients.forEach((c) => c.leave());
        void this.disconnect();
    }

    // ---- Nội bộ ------------------------------------------------------------------------------

    /** Bỏ `playerId` khỏi party (tự rời / offline) và dọn con trỏ, đá kết nối party còn lại. */
    private async removePlayer(playerId: string, code: PartyNoticeCode, kickSocket = true) {
        if (!this.model.has(playerId)) return;
        const name = this.nameOf(playerId);
        this.model.leave(playerId);
        await this.afterRemoved(playerId, code, name, kickSocket);
    }

    private async afterRemoved(
        playerId: string,
        code: PartyNoticeCode,
        name: string,
        kickSocket: boolean
    ) {
        const sessionId = this.sessionOf.get(playerId);
        this.sessionOf.delete(playerId);
        await this.release(playerId);
        if (kickSocket && sessionId) this.clients.getById(sessionId)?.leave();
        if (this.disbanded) return;

        if (this.model.size === 0) {
            this.disbanded = true;
            void this.disconnect();
            return;
        }
        // Chủ có thể đã đổi (kick/leave của chủ cũ): đồng bộ rồi báo.
        const leaderBefore = this.state.leaderPlayerId;
        this.syncState();
        this.broadcastNotice(code, name, playerId);
        if (leaderBefore !== this.model.leaderId) {
            this.broadcastNotice(PartyNoticeCode.LEADER_CHANGED, this.nameOf(this.model.leaderId));
        }
    }

    /** Xoá con trỏ party và báo world room bỏ party của player. */
    private async release(playerId: string) {
        await partyDirectoryService.clearPartyRoomId(playerId);
        const worldRoomId = this.worldRoomOf.get(playerId);
        this.worldRoomOf.delete(playerId);
        if (worldRoomId) void worldRemote.setPlayerParty(worldRoomId, playerId, null);
    }

    private expireInvites() {
        for (const [, invite] of this.model.pruneInvites(this.clock.currentTime)) {
            this.notifyLeader(PartyNoticeCode.INVITE_EXPIRED, invite.snapshot.name);
        }
    }

    private async isRoomAlive(roomId: string) {
        try {
            return (await matchMaker.getRoomById(roomId)) !== undefined;
        } catch {
            return false;
        }
    }

    private nameOf(playerId: string) {
        return this.model.members.get(playerId)?.name ?? "";
    }

    /** Ghi model ra Schema (thêm / sửa / xoá thành viên, chủ). */
    private syncState() {
        const present = new Set(this.model.members.keys());
        for (const id of [...this.state.members.keys()]) {
            if (!present.has(id)) this.state.members.delete(id);
        }
        for (const [id, info] of this.model.members) {
            const member = this.state.members.get(id);
            if (!member) {
                this.state.members.set(id, new PartyMemberState({ ...info }));
                continue;
            }
            member.name = info.name;
            member.level = info.level;
            member.hp = info.hp;
            member.maxHp = info.maxHp;
            member.mapCode = info.mapCode;
            member.inWorld = info.inWorld;
            member.inDungeon = info.inDungeon;
        }
        this.state.leaderPlayerId = this.model.leaderId;
        this.state.lootMode = this.model.lootMode;
    }

    private notice(client: PlayerClient, code: PartyNoticeCode, playerName?: string) {
        const message: PartyNoticeMessage = { code, ...(playerName ? { playerName } : {}) };
        client.send(PartyMessage.NOTICE, message);
    }

    private notifyLeader(code: PartyNoticeCode, playerName?: string) {
        const sessionId = this.sessionOf.get(this.model.leaderId);
        const client = sessionId ? this.clients.getById(sessionId) : undefined;
        if (client) this.notice(client, code, playerName);
    }

    private broadcastNotice(code: PartyNoticeCode, playerName?: string, exceptPlayerId?: string) {
        const message: PartyNoticeMessage = { code, ...(playerName ? { playerName } : {}) };
        this.broadcast(PartyMessage.NOTICE, message, {
            except: exceptPlayerId
                ? [this.sessionOf.get(exceptPlayerId)]
                      .map((sessionId) => (sessionId ? this.clients.getById(sessionId) : undefined))
                      .filter((c): c is NonNullable<typeof c> => c !== undefined)
                : undefined,
        });
    }

    private broadcastDenied(
        dungeonCode: string,
        failures: {
            playerId: string;
            name: string;
            reason: PartyDungeonDeniedMessage["failures"][number]["reason"];
        }[]
    ) {
        const message: PartyDungeonDeniedMessage = { dungeonCode, failures };
        this.broadcast(PartyMessage.DUNGEON_DENIED, message);
    }
}

/** Mã lỗi world room trả khi kiểm lại vào dungeon → lý do hiển thị. */
const toDenyReason = (error: string) =>
    (
        ({
            level_too_low: "level_too_low",
            dead: "dead",
            in_dungeon: "in_dungeon",
        }) as Record<string, PartyDungeonDeniedMessage["failures"][number]["reason"]>
    )[error] ?? ("offline" as PartyDungeonDeniedMessage["failures"][number]["reason"]);
