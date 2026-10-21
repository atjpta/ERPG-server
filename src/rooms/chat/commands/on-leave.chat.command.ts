import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { ChatRoom } from "@/rooms/chat/chat.room.js";
import { Command } from "@colyseus/command";

export class OnLeaveChatCommand extends Command<ChatRoom, { client: PlayerClient }> {
    async execute({ client }: { client: PlayerClient }) {
        await this.room.unregisterPlayer(client);
        const { playerId } = client.auth;
        // Kết nối cũ bị thay thế không được xoá phiên của kết nối mới.
        if (this.room.sessionOf.get(playerId) !== client.sessionId) return;
        this.room.sessionOf.delete(playerId);
        this.room.profileOf.delete(playerId);
    }
}
