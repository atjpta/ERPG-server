import { DateTime } from "luxon";
import { BaseService } from "@/core/services/base.service.js";
import { ChatMessages } from "@/modules/chat/entities/chat-message.entity.js";
import {
    ChatMessageRepo,
    type ChatMessageRepository,
} from "@/modules/chat/repositories/chat-message.repository.js";

export class ChatMessageService extends BaseService<typeof ChatMessages> {
    constructor(private readonly chatRepo: ChatMessageRepository = ChatMessageRepo) {
        super(chatRepo);
    }

    findRecentByChannel(params: Parameters<ChatMessageRepository["findRecentByChannel"]>[0]) {
        return this.chatRepo.findRecentByChannel(params);
    }

    findRecentWhispers(params: Parameters<ChatMessageRepository["findRecentWhispers"]>[0]) {
        return this.chatRepo.findRecentWhispers(params);
    }

    /** Xoá tin cũ hơn `retentionDays` ngày; trả về số dòng đã xoá. */
    async purgeOlderThan(retentionDays: number): Promise<number> {
        const before = DateTime.now().minus({ days: retentionDays }).toJSDate();
        return (await this.chatRepo.deleteOlderThan({ before })).length;
    }
}

export const chatMessageService = new ChatMessageService();
