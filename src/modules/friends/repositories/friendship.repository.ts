import { and, count, eq, gt, inArray, lt, or, type SQL } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Friendships } from "@/modules/friends/entities/friendship.entity.js";
import { FriendshipStatus } from "@/modules/friends/enums/friendship-status.enum.js";

export class FriendshipRepository extends BaseRepository<typeof Friendships> {
    constructor() {
        super(Friendships);
    }

    /** Dòng của cặp `a`–`b`, không phân biệt ai gửi lời mời. */
    async findBetween(params: { a: string; b: string; dbOrTx?: Queryable }) {
        const { a, b, dbOrTx } = params;
        return this.findOne({ where: this.pair(a, b), dbOrTx });
    }

    /**
     * Mọi dòng liên quan tới `playerId`. Lời mời `pending` tạo sau `pendingCreatedAfter` mới được tính (cũ hơn = hết hạn).
     */
    async findByPlayer(params: {
        playerId: string;
        pendingCreatedAfter: Date;
        dbOrTx?: Queryable;
    }) {
        const { playerId, pendingCreatedAfter, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(Friendships)
            .where(and(this.involves(playerId), this.acceptedOrAlive(pendingCreatedAfter)));
    }

    /** Id các bạn (đã `accepted`) của `playerId`. */
    async findFriendIds(params: { playerId: string; dbOrTx?: Queryable }) {
        const { playerId, dbOrTx = db } = params;
        const rows = await dbOrTx
            .select({
                requesterId: Friendships.requesterId,
                addresseeId: Friendships.addresseeId,
            })
            .from(Friendships)
            .where(and(this.involves(playerId), eq(Friendships.status, FriendshipStatus.ACCEPTED)));
        return rows.map((row) =>
            row.requesterId === playerId ? row.addresseeId : row.requesterId
        );
    }

    async countFriends(params: { playerId: string; dbOrTx?: Queryable }) {
        const { playerId, dbOrTx } = params;
        return this.count({
            where: and(this.involves(playerId), eq(Friendships.status, FriendshipStatus.ACCEPTED))!,
            dbOrTx,
        });
    }

    /** Số lời mời còn hạn `playerId` đã gửi (`sent`) hoặc đang chờ trả lời (`received`). */
    async countPending(params: {
        playerId: string;
        direction: "sent" | "received";
        createdAfter: Date;
        dbOrTx?: Queryable;
    }) {
        const { playerId, direction, createdAfter, dbOrTx = db } = params;
        const side = direction === "sent" ? Friendships.requesterId : Friendships.addresseeId;
        const [{ total }] = await dbOrTx
            .select({ total: count() })
            .from(Friendships)
            .where(
                and(
                    eq(side, playerId),
                    eq(Friendships.status, FriendshipStatus.PENDING),
                    gt(Friendships.createdAt, createdAfter)
                )
            );
        return total;
    }

    /**
     * Chấp nhận lời mời `requesterId` → `addresseeId` còn hạn. Một câu lệnh có điều kiện (`status = pending`): khi accept / decline /
     * cancel chạy đồng thời chỉ một lệnh thắng. `null` = không còn lời mời nào để chấp nhận.
     */
    async acceptPending(params: {
        requesterId: string;
        addresseeId: string;
        createdAfter: Date;
        respondedAt: Date;
        dbOrTx?: Queryable;
    }) {
        const { requesterId, addresseeId, createdAfter, respondedAt, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .update(Friendships)
            .set({ status: FriendshipStatus.ACCEPTED, respondedAt })
            .where(this.pendingRequest(requesterId, addresseeId, createdAfter))
            .returning();
        return row ?? null;
    }

    /** Xoá lời mời `requesterId` → `addresseeId` còn hạn (decline / cancel); `null` = không còn lời mời nào (đã bị xử lý trước). */
    async deletePending(params: {
        requesterId: string;
        addresseeId: string;
        createdAfter: Date;
        dbOrTx?: Queryable;
    }) {
        const { requesterId, addresseeId, createdAfter, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .delete(Friendships)
            .where(this.pendingRequest(requesterId, addresseeId, createdAfter))
            .returning();
        return row ?? null;
    }

    /** Xoá quan hệ bạn bè đã chấp nhận giữa hai người; `null` nếu không còn. */
    async deleteAccepted(params: { a: string; b: string; dbOrTx?: Queryable }) {
        const { a, b, dbOrTx = db } = params;
        const [row] = await dbOrTx
            .delete(Friendships)
            .where(and(this.pair(a, b), eq(Friendships.status, FriendshipStatus.ACCEPTED)))
            .returning();
        return row ?? null;
    }

    async deleteBetween(params: { a: string; b: string; dbOrTx?: Queryable }) {
        const { a, b, dbOrTx = db } = params;
        return dbOrTx.delete(Friendships).where(this.pair(a, b)).returning();
    }

    /** Xoá tối đa `limit` lời mời hết hạn (theo lô để không khoá bảng lâu); trả id đã xoá — ít hơn `limit` nghĩa là đã hết. */
    async deleteExpiredPending(params: { before: Date; limit: number; dbOrTx?: Queryable }) {
        const { before, limit, dbOrTx = db } = params;
        const batch = dbOrTx
            .select({ id: Friendships.id })
            .from(Friendships)
            .where(
                and(
                    eq(Friendships.status, FriendshipStatus.PENDING),
                    lt(Friendships.createdAt, before)
                )
            )
            .limit(limit);
        return dbOrTx
            .delete(Friendships)
            .where(inArray(Friendships.id, batch))
            .returning({ id: Friendships.id });
    }

    private pendingRequest(requesterId: string, addresseeId: string, createdAfter: Date): SQL {
        return and(
            eq(Friendships.requesterId, requesterId),
            eq(Friendships.addresseeId, addresseeId),
            eq(Friendships.status, FriendshipStatus.PENDING),
            gt(Friendships.createdAt, createdAfter)
        )!;
    }

    private pair(a: string, b: string): SQL {
        return or(
            and(eq(Friendships.requesterId, a), eq(Friendships.addresseeId, b)),
            and(eq(Friendships.requesterId, b), eq(Friendships.addresseeId, a))
        )!;
    }

    private involves(playerId: string): SQL {
        return or(eq(Friendships.requesterId, playerId), eq(Friendships.addresseeId, playerId))!;
    }

    private acceptedOrAlive(pendingCreatedAfter: Date): SQL {
        return or(
            eq(Friendships.status, FriendshipStatus.ACCEPTED),
            gt(Friendships.createdAt, pendingCreatedAfter)
        )!;
    }
}

export const FriendshipRepo = new FriendshipRepository();
