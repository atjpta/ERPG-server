import { DateTime } from "luxon";
import type { Queryable } from "@/configs/postgres.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { Friendships, type FriendshipRow } from "@/modules/friends/entities/friendship.entity.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import { FriendshipStatus } from "@/modules/friends/enums/friendship-status.enum.js";
import {
    FriendshipRepo,
    type FriendshipRepository,
} from "@/modules/friends/repositories/friendship.repository.js";
import { PlayerBlockRepo } from "@/modules/friends/repositories/player-block.repository.js";
import { lockFriendPlayers } from "@/modules/friends/utils/friend-lock.util.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";

/** Thao tác bị từ chối: `code` là mã lỗi trả cho client, `data` là dữ liệu kèm theo (vd `{ max }`). */
export interface FriendFailure {
    code: FriendErrorCode;
    data?: Record<string, unknown>;
}

/** Thu hẹp kiểu của kết quả service (tsconfig tắt strictNullChecks nên không dùng truthiness được). */
export const isFriendFailure = (value: unknown): value is FriendFailure =>
    typeof value === "object" && value !== null && "code" in value && !("friendship" in value);

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

/**
 * Luật nghiệp vụ bạn bè. Mọi thao tác "kiểm tra rồi ghi" (block, giới hạn số bạn / lời mời, trùng lặp) chạy trong MỘT transaction
 * giữ khoá tư vấn của các người chơi liên quan (`lockFriendPlayers`) nên nhiều yêu cầu đồng thời xếp hàng thay vì đua nhau.
 * Thao tác kết thúc một lời mời (accept / decline / cancel / remove) là câu lệnh có điều kiện theo trạng thái, nên chỉ một bên thắng
 * và kết quả báo về luôn khớp với DB.
 */
export class FriendshipService extends BaseService<typeof Friendships> {
    constructor(private readonly friendRepo: FriendshipRepository = FriendshipRepo) {
        super(friendRepo);
    }

    private get config() {
        return masterDataCacheService.get(MasterDataKey.FRIEND_CONFIG);
    }

    /** Lời mời tạo trước mốc này đã hết hạn. */
    private pendingCutoff(): Date {
        return DateTime.now().minus({ days: this.config.requestTtlDays }).toJSDate();
    }

    private isExpired(row: FriendshipRow): boolean {
        return (
            row.status === FriendshipStatus.PENDING &&
            row.createdAt.getTime() <= this.pendingCutoff().getTime()
        );
    }

    findFriendIds(params: Parameters<FriendshipRepository["findFriendIds"]>[0]) {
        return this.friendRepo.findFriendIds(params);
    }

    async areFriends(a: string, b: string): Promise<boolean> {
        const row = await this.friendRepo.findBetween({ a, b });
        return row?.status === FriendshipStatus.ACCEPTED;
    }

    /**
     * `fromId` gửi lời mời cho `toId`. Người kia đã chặn `fromId` thì trả `FRIEND_TARGET_NOT_FOUND` (không lộ việc bị
     * chặn). Nếu `toId` đã mời `fromId` trước đó thì thành bạn luôn (`kind: "accepted"`).
     */
    async sendRequest(params: {
        fromId: string;
        toId: string;
    }): Promise<FriendRequestOutcome | FriendFailure> {
        const { fromId, toId } = params;
        if (fromId === toId) return { code: FriendErrorCode.FRIEND_SELF_TARGET };

        return withTransaction(async (tx) => {
            await lockFriendPlayers(tx, fromId, toId);

            // Kiểm tra block trong khoá: block của người kia chạy trước thì thấy ở đây, chạy sau thì xoá dòng ta vừa tạo.
            if (
                await PlayerBlockRepo.findPair({ blockerId: toId, blockedId: fromId, dbOrTx: tx })
            ) {
                return { code: FriendErrorCode.FRIEND_TARGET_NOT_FOUND };
            }
            if (
                await PlayerBlockRepo.findPair({ blockerId: fromId, blockedId: toId, dbOrTx: tx })
            ) {
                return { code: FriendErrorCode.FRIEND_BLOCKED_BY_YOU };
            }

            const existing = await this.friendRepo.findBetween({ a: fromId, b: toId, dbOrTx: tx });
            if (existing && this.isExpired(existing)) {
                await this.friendRepo.deleteBetween({ a: fromId, b: toId, dbOrTx: tx });
            } else if (existing) {
                if (existing.status === FriendshipStatus.ACCEPTED) {
                    return { code: FriendErrorCode.FRIEND_ALREADY_FRIENDS };
                }
                if (existing.requesterId === fromId) {
                    return { code: FriendErrorCode.FRIEND_REQUEST_EXISTS };
                }
                // Người kia đã mời mình: gửi lời mời chéo = đồng ý.
                const accepted = await this.acceptLocked(tx, { playerId: fromId, fromId: toId });
                return isFriendFailure(accepted)
                    ? accepted
                    : { kind: "accepted" as const, friendship: accepted.friendship };
            }

            const limit = await this.checkLimits(tx, fromId, toId);
            if (limit) return limit;
            const config = this.config;
            const createdAfter = this.pendingCutoff();
            const [sentCount, receivedCount] = await Promise.all([
                this.friendRepo.countPending({
                    playerId: fromId,
                    direction: "sent",
                    createdAfter,
                    dbOrTx: tx,
                }),
                this.friendRepo.countPending({
                    playerId: toId,
                    direction: "received",
                    createdAfter,
                    dbOrTx: tx,
                }),
            ]);
            if (sentCount >= config.maxPendingSent) {
                return {
                    code: FriendErrorCode.FRIEND_TOO_MANY_SENT,
                    data: { max: config.maxPendingSent },
                };
            }
            if (receivedCount >= config.maxPendingReceived) {
                return { code: FriendErrorCode.FRIEND_TARGET_TOO_MANY_PENDING };
            }

            const friendship = await this.friendRepo.create({
                data: { requesterId: fromId, addresseeId: toId, status: FriendshipStatus.PENDING },
                dbOrTx: tx,
            });
            return { kind: "sent" as const, friendship };
        });
    }

    /** `playerId` chấp nhận lời mời `fromId` đã gửi. */
    accept(params: {
        playerId: string;
        fromId: string;
    }): Promise<{ friendship: FriendshipRow } | FriendFailure> {
        return withTransaction(async (tx) => {
            await lockFriendPlayers(tx, params.playerId, params.fromId);
            return this.acceptLocked(tx, params);
        });
    }

    /**
     * Chấp nhận khi đã giữ khoá của hai người: chưa bị chặn, còn chỗ trong cả hai danh sách bạn, rồi mới chuyển trạng thái bằng
     * câu lệnh có điều kiện (decline / cancel chạy đồng thời không cần khoá — ai thắng thì bên kia nhận `FRIEND_NO_REQUEST`).
     */
    private async acceptLocked(
        tx: Queryable,
        params: { playerId: string; fromId: string }
    ): Promise<{ friendship: FriendshipRow } | FriendFailure> {
        const { playerId, fromId } = params;
        const request = await this.friendRepo.findBetween({ a: playerId, b: fromId, dbOrTx: tx });
        if (
            !request ||
            request.status !== FriendshipStatus.PENDING ||
            request.requesterId !== fromId ||
            this.isExpired(request) ||
            (await this.isBlocked(tx, playerId, fromId))
        ) {
            return { code: FriendErrorCode.FRIEND_NO_REQUEST };
        }
        const limit = await this.checkLimits(tx, playerId, fromId);
        if (limit) return limit;

        const friendship = await this.friendRepo.acceptPending({
            requesterId: fromId,
            addresseeId: playerId,
            createdAfter: this.pendingCutoff(),
            respondedAt: DateTime.now().toJSDate(),
            dbOrTx: tx,
        });
        return friendship ? { friendship } : { code: FriendErrorCode.FRIEND_NO_REQUEST };
    }

    /** `playerId` từ chối lời mời `fromId` đã gửi. */
    async decline(params: { playerId: string; fromId: string }): Promise<null | FriendFailure> {
        const deleted = await this.friendRepo.deletePending({
            requesterId: params.fromId,
            addresseeId: params.playerId,
            createdAfter: this.pendingCutoff(),
        });
        return deleted ? null : { code: FriendErrorCode.FRIEND_NO_REQUEST };
    }

    /** `playerId` huỷ lời mời đã gửi cho `toId`. */
    async cancel(params: { playerId: string; toId: string }): Promise<null | FriendFailure> {
        const deleted = await this.friendRepo.deletePending({
            requesterId: params.playerId,
            addresseeId: params.toId,
            createdAfter: this.pendingCutoff(),
        });
        return deleted ? null : { code: FriendErrorCode.FRIEND_NO_REQUEST };
    }

    /** Xoá bạn (hai chiều). */
    async remove(params: { playerId: string; friendId: string }): Promise<null | FriendFailure> {
        const deleted = await this.friendRepo.deleteAccepted({
            a: params.playerId,
            b: params.friendId,
        });
        return deleted ? null : { code: FriendErrorCode.FRIEND_NOT_FRIEND };
    }

    /** Bạn bè + lời mời đã nhận / đã gửi còn hạn của `playerId`, kèm tên hiện tại của người kia. */
    async listFor(playerId: string): Promise<FriendLists> {
        const rows = await this.friendRepo.findByPlayer({
            playerId,
            pendingCreatedAfter: this.pendingCutoff(),
        });
        const otherOf = (row: FriendshipRow) =>
            row.requesterId === playerId ? row.addresseeId : row.requesterId;
        const players = await PlayerIdentityRepo.findByIds(rows.map(otherOf));
        const nameOf = new Map(players.map((player) => [player.id, player.name]));

        const lists: FriendLists = { friends: [], received: [], sent: [] };
        for (const row of rows) {
            const other = otherOf(row);
            const name = nameOf.get(other);
            if (!name) continue;
            if (row.status === FriendshipStatus.ACCEPTED) {
                lists.friends.push({
                    playerId: other,
                    name,
                    since: (row.respondedAt ?? row.createdAt).getTime(),
                });
            } else {
                const entry = { playerId: other, name, sentAt: row.createdAt.getTime() };
                (row.requesterId === playerId ? lists.sent : lists.received).push(entry);
            }
        }
        return lists;
    }

    /** Dọn lời mời hết hạn (theo lô); trả số dòng đã xoá. Gọi lặp tới khi trả ít hơn `limit`. */
    async purgeExpiredRequests(limit = 500): Promise<number> {
        const deleted = await this.friendRepo.deleteExpiredPending({
            before: this.pendingCutoff(),
            limit,
        });
        return deleted.length;
    }

    private async isBlocked(tx: Queryable, a: string, b: string): Promise<boolean> {
        const [aBlocksB, bBlocksA] = await Promise.all([
            PlayerBlockRepo.findPair({ blockerId: a, blockedId: b, dbOrTx: tx }),
            PlayerBlockRepo.findPair({ blockerId: b, blockedId: a, dbOrTx: tx }),
        ]);
        return Boolean(aBlocksB || bBlocksA);
    }

    /** Cả hai phía còn chỗ trong danh sách bạn (đếm trong transaction đang giữ khoá của hai người). */
    private async checkLimits(
        tx: Queryable,
        selfId: string,
        otherId: string
    ): Promise<FriendFailure | null> {
        const max = this.config.maxFriends;
        const [selfCount, otherCount] = await Promise.all([
            this.friendRepo.countFriends({ playerId: selfId, dbOrTx: tx }),
            this.friendRepo.countFriends({ playerId: otherId, dbOrTx: tx }),
        ]);
        if (selfCount >= max) return { code: FriendErrorCode.FRIEND_LIST_FULL, data: { max } };
        if (otherCount >= max) return { code: FriendErrorCode.FRIEND_TARGET_LIST_FULL };
        return null;
    }
}

export const friendshipService = new FriendshipService();
