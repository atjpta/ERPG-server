import { and, eq } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { PlayerBlocks } from "@/modules/friends/entities/player-block.entity.js";

export class PlayerBlockRepository extends BaseRepository<typeof PlayerBlocks> {
    constructor() {
        super(PlayerBlocks);
    }

    async findPair(params: { blockerId: string; blockedId: string; dbOrTx?: Queryable }) {
        const { blockerId, blockedId, dbOrTx } = params;
        return this.findOne({
            where: and(
                eq(PlayerBlocks.blockerId, blockerId),
                eq(PlayerBlocks.blockedId, blockedId)
            )!,
            dbOrTx,
        });
    }

    /** Dòng chặn do `blockerId` tạo, cũ → mới. */
    async findByBlocker(params: { blockerId: string; dbOrTx?: Queryable }) {
        const { blockerId, dbOrTx = db } = params;
        return dbOrTx
            .select()
            .from(PlayerBlocks)
            .where(eq(PlayerBlocks.blockerId, blockerId))
            .orderBy(PlayerBlocks.id);
    }

    async countByBlocker(params: { blockerId: string; dbOrTx?: Queryable }) {
        const { blockerId, dbOrTx } = params;
        return this.count({ where: eq(PlayerBlocks.blockerId, blockerId), dbOrTx });
    }

    async deletePair(params: { blockerId: string; blockedId: string; dbOrTx?: Queryable }) {
        const { blockerId, blockedId, dbOrTx = db } = params;
        return dbOrTx
            .delete(PlayerBlocks)
            .where(
                and(eq(PlayerBlocks.blockerId, blockerId), eq(PlayerBlocks.blockedId, blockedId))
            )
            .returning();
    }
}

export const PlayerBlockRepo = new PlayerBlockRepository();
