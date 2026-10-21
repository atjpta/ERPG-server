import { and, desc, eq, getTableColumns, isNull, lt, or, type SQL } from "drizzle-orm";
import { db, type Queryable } from "@/configs/postgres.config.js";
import { BaseRepository } from "@/core/repositories/base.repository.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { ChatMessages } from "@/modules/chat/entities/chat-message.entity.js";
import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";

export class ChatMessageRepository extends BaseRepository<typeof ChatMessages> {
    constructor() {
        super(ChatMessages);
    }

    /**
     * Tin của một kênh, mới → cũ. `scopeKey` null = kênh không có phạm vi. `before` là `id` (uuid v7, tăng theo
     * thời gian) của tin cũ nhất client đang có: chỉ lấy tin cũ hơn nó (loadmore, không sót / lặp ở ranh giới).
     */
    async findRecentByChannel(params: {
        serverId: string;
        channel: ChatChannelKey;
        scopeKey?: string | null;
        before?: string;
        limit: number;
        dbOrTx?: Queryable;
    }) {
        const { serverId, channel, scopeKey = null, before, limit, dbOrTx = db } = params;
        return this.selectWithSender(dbOrTx)
            .where(
                and(
                    eq(ChatMessages.serverId, serverId),
                    eq(ChatMessages.channel, channel),
                    scopeKey === null
                        ? isNull(ChatMessages.scopeKey)
                        : eq(ChatMessages.scopeKey, scopeKey),
                    this.olderThan(before)
                )
            )
            .orderBy(desc(ChatMessages.id))
            .limit(limit);
    }

    /** Whisper mà player gửi hoặc nhận, mới → cũ; `before` như `findRecentByChannel`. */
    async findRecentWhispers(params: {
        playerId: string;
        before?: string;
        limit: number;
        dbOrTx?: Queryable;
    }) {
        const { playerId, before, limit, dbOrTx = db } = params;
        return this.selectWithSender(dbOrTx)
            .where(
                and(
                    eq(ChatMessages.channel, ChatChannelKey.WHISPER),
                    or(
                        eq(ChatMessages.senderPlayerId, playerId),
                        eq(ChatMessages.targetPlayerId, playerId)
                    ),
                    this.olderThan(before)
                )
            )
            .orderBy(desc(ChatMessages.id))
            .limit(limit);
    }

    async deleteOlderThan(params: { before: Date; dbOrTx?: Queryable }) {
        const { before, dbOrTx = db } = params;
        return dbOrTx
            .delete(ChatMessages)
            .where(lt(ChatMessages.createdAt, before))
            .returning({ id: ChatMessages.id });
    }

    /** Dòng tin kèm tên hiện tại của người gửi (bảng không lưu tên). */
    private selectWithSender(dbOrTx: Queryable) {
        return dbOrTx
            .select({ ...getTableColumns(ChatMessages), senderName: Players.name })
            .from(ChatMessages)
            .innerJoin(Players, eq(Players.id, ChatMessages.senderPlayerId));
    }

    private olderThan(before?: string): SQL | undefined {
        return before ? lt(ChatMessages.id, before) : undefined;
    }
}

export const ChatMessageRepo = new ChatMessageRepository();
