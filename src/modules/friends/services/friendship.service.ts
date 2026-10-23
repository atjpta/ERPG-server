import { DateTime } from "luxon";
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
        const config = this.config;
        if (fromId === toId) return { code: FriendErrorCode.FRIEND_SELF_TARGET };
        if (await PlayerBlockRepo.findPair({ blockerId: toId, blockedId: fromId })) {
            return { code: FriendErrorCode.FRIEND_TARGET_NOT_FOUND };
        }
        if (await PlayerBlockRepo.findPair({ blockerId: fromId, blockedId: toId })) {
            return { code: FriendErrorCode.FRIEND_BLOCKED_BY_YOU };
        }

        const existing = await this.friendRepo.findBetween({ a: fromId, b: toId });
        if (existing && this.isExpired(existing)) {
            await this.friendRepo.deleteBetween({ a: fromId, b: toId });
        } else if (existing) {
            if (existing.status === FriendshipStatus.ACCEPTED) {
                return { code: FriendErrorCode.FRIEND_ALREADY_FRIENDS };
            }
            if (existing.requesterId === fromId) {
                return { code: FriendErrorCode.FRIEND_REQUEST_EXISTS };
            }
            // Người kia đã mời mình: gửi lời mời chéo = đồng ý.
            const accepted = await this.accept({ playerId: fromId, fromId: toId });
            return isFriendFailure(accepted)
                ? accepted
                : { kind: "accepted", friendship: accepted.friendship };
        }

        const limit = await this.checkLimits(fromId, toId);
        if (limit) return limit;
        const [sentCount, receivedCount] = await Promise.all([
            this.friendRepo.countPending({
                playerId: fromId,
                direction: "sent",
                createdAfter: this.pendingCutoff(),
            }),
            this.friendRepo.countPending({
                playerId: toId,
                direction: "received",
                createdAfter: this.pendingCutoff(),
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
        });
        return { kind: "sent", friendship };
    }

    /** `playerId` chấp nhận lời mời `fromId` đã gửi. */
    async accept(params: {
        playerId: string;
        fromId: string;
    }): Promise<{ friendship: FriendshipRow } | FriendFailure> {
        const { playerId, fromId } = params;
        const row = await this.findIncomingRequest(playerId, fromId);
        if (!row) return { code: FriendErrorCode.FRIEND_NO_REQUEST };
        const limit = await this.checkLimits(playerId, fromId);
        if (limit) return limit;
        const friendship = await this.friendRepo.updateByIdOrFail({
            id: row.id,
            data: {
                status: FriendshipStatus.ACCEPTED,
                respondedAt: DateTime.now().toJSDate(),
            },
        });
        return { friendship };
    }

    /** `playerId` từ chối lời mời `fromId` đã gửi. */
    async decline(params: { playerId: string; fromId: string }): Promise<null | FriendFailure> {
        const { playerId, fromId } = params;
        const row = await this.findIncomingRequest(playerId, fromId);
        if (!row) return { code: FriendErrorCode.FRIEND_NO_REQUEST };
        await this.friendRepo.deleteById({ id: row.id });
        return null;
    }

    /** `playerId` huỷ lời mời đã gửi cho `toId`. */
    async cancel(params: { playerId: string; toId: string }): Promise<null | FriendFailure> {
        const { playerId, toId } = params;
        const row = await this.findIncomingRequest(toId, playerId);
        if (!row) return { code: FriendErrorCode.FRIEND_NO_REQUEST };
        await this.friendRepo.deleteById({ id: row.id });
        return null;
    }

    /** Xoá bạn (hai chiều). */
    async remove(params: { playerId: string; friendId: string }): Promise<null | FriendFailure> {
        const { playerId, friendId } = params;
        const row = await this.friendRepo.findBetween({ a: playerId, b: friendId });
        if (row?.status !== FriendshipStatus.ACCEPTED) {
            return { code: FriendErrorCode.FRIEND_NOT_FRIEND };
        }
        await this.friendRepo.deleteById({ id: row.id });
        return null;
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

    /** Lời mời còn hạn từ `fromId` tới `playerId`. */
    private async findIncomingRequest(playerId: string, fromId: string) {
        const row = await this.friendRepo.findBetween({ a: playerId, b: fromId });
        if (
            !row ||
            row.status !== FriendshipStatus.PENDING ||
            row.requesterId !== fromId ||
            this.isExpired(row)
        ) {
            return null;
        }
        return row;
    }

    /** Cả hai phía còn chỗ trong danh sách bạn. */
    private async checkLimits(selfId: string, otherId: string): Promise<FriendFailure | null> {
        const max = this.config.maxFriends;
        const [selfCount, otherCount] = await Promise.all([
            this.friendRepo.countFriends({ playerId: selfId }),
            this.friendRepo.countFriends({ playerId: otherId }),
        ]);
        if (selfCount >= max) return { code: FriendErrorCode.FRIEND_LIST_FULL, data: { max } };
        if (otherCount >= max) return { code: FriendErrorCode.FRIEND_TARGET_LIST_FULL };
        return null;
    }
}

export const friendshipService = new FriendshipService();
