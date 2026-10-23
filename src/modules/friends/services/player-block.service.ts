import { withTransaction } from "@/core/repositories/base.repository.js";
import { BaseService } from "@/core/services/base.service.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { PlayerBlocks } from "@/modules/friends/entities/player-block.entity.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import { FriendshipRepo } from "@/modules/friends/repositories/friendship.repository.js";
import {
    PlayerBlockRepo,
    type PlayerBlockRepository,
} from "@/modules/friends/repositories/player-block.repository.js";
import { lockFriendPlayers } from "@/modules/friends/utils/friend-lock.util.js";
import type { FriendFailure } from "@/modules/friends/services/friendship.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";

export interface BlockedEntry {
    playerId: string;
    name: string;
}

export class PlayerBlockService extends BaseService<typeof PlayerBlocks> {
    constructor(private readonly blockRepo: PlayerBlockRepository = PlayerBlockRepo) {
        super(blockRepo);
    }

    /** `blockerId` có đang chặn `blockedId` không. */
    async isBlocked(params: { blockerId: string; blockedId: string }): Promise<boolean> {
        return Boolean(await this.blockRepo.findPair(params));
    }

    /** Hai người có chặn nhau theo bất kỳ chiều nào không (để chặn whisper / mời party). */
    async isBlockedEitherWay(a: string, b: string): Promise<boolean> {
        const [aBlocksB, bBlocksA] = await Promise.all([
            this.blockRepo.findPair({ blockerId: a, blockedId: b }),
            this.blockRepo.findPair({ blockerId: b, blockedId: a }),
        ]);
        return Boolean(aBlocksB || bBlocksA);
    }

    /**
     * `blockerId` chặn `blockedId`: xoá luôn quan hệ bạn bè / lời mời giữa hai người. Chặn lại người đã chặn là no-op.
     * Trả `removedFriendship = true` nếu vừa xoá một dòng bạn bè hoặc lời mời.
     */
    async block(params: {
        blockerId: string;
        blockedId: string;
    }): Promise<{ removedFriendship: boolean } | FriendFailure> {
        const { blockerId, blockedId } = params;
        if (blockerId === blockedId) return { code: FriendErrorCode.FRIEND_SELF_TARGET };
        if (await this.blockRepo.findPair({ blockerId, blockedId })) {
            return { removedFriendship: false };
        }
        const max = masterDataCacheService.get(MasterDataKey.FRIEND_CONFIG).maxBlocked;
        // Khoá cả hai người rồi mới kiểm tra / đếm / ghi: hai lần chặn đồng thời của một người không vượt giới hạn, và lời mời đang
        // chạy của người bị chặn hoặc ghi xong trước (bị xoá ở đây) hoặc thấy block ở bước kiểm tra của nó.
        return withTransaction(async (tx) => {
            await lockFriendPlayers(tx, blockerId, blockedId);
            if (await this.blockRepo.findPair({ blockerId, blockedId, dbOrTx: tx })) {
                return { removedFriendship: false };
            }
            if ((await this.blockRepo.countByBlocker({ blockerId, dbOrTx: tx })) >= max) {
                return { code: FriendErrorCode.FRIEND_BLOCK_LIST_FULL, data: { max } };
            }
            await this.blockRepo.create({ data: { blockerId, blockedId }, dbOrTx: tx });
            const removed = await FriendshipRepo.deleteBetween({
                a: blockerId,
                b: blockedId,
                dbOrTx: tx,
            });
            return { removedFriendship: removed.length > 0 };
        });
    }

    async unblock(params: { blockerId: string; blockedId: string }): Promise<null | FriendFailure> {
        const removed = await this.blockRepo.deletePair(params);
        return removed.length > 0 ? null : { code: FriendErrorCode.FRIEND_NOT_BLOCKED };
    }

    async listFor(blockerId: string): Promise<BlockedEntry[]> {
        const rows = await this.blockRepo.findByBlocker({ blockerId });
        const players = await PlayerIdentityRepo.findByIds(rows.map((row) => row.blockedId));
        const nameOf = new Map(players.map((player) => [player.id, player.name]));
        return rows.flatMap((row) => {
            const name = nameOf.get(row.blockedId);
            return name ? [{ playerId: row.blockedId, name }] : [];
        });
    }
}

export const playerBlockService = new PlayerBlockService();
