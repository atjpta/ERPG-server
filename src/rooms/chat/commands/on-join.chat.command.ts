import { ChatChannelKey } from "@/modules/chat/enums/chat-channel-key.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { ChatRoom } from "@/rooms/chat/chat.room.js";
import { chatDeliveryService } from "@/rooms/chat/modules/messages/services/chat-delivery.chat.service.js";
import { Command } from "@colyseus/command";

export class OnJoinChatCommand extends Command<ChatRoom, { client: PlayerClient }> {
    async execute({ client }: { client: PlayerClient }) {
        const { playerId, serverId } = client.auth;
        if (serverId !== this.room.serverId) throw new Error("Wrong chat server");

        const player = await playerService.assertPlayableOrFail(playerId);
        // Mỗi player một kết nối chat: kết nối cũ (máy khác / rớt mạng chưa kịp thoát) bị thay.
        const previous = this.room.sessionOf.get(playerId);
        this.room.sessionOf.set(playerId, client.sessionId);
        this.room.profileOf.set(playerId, { name: player.name });
        if (previous) this.room.clients.get(previous)?.leave();
        await this.room.registerPlayer(client);

        for (const channelKey of Object.values(ChatChannelKey)) {
            await chatDeliveryService.sendHistory({
                room: this.room,
                client,
                channelKey,
                onJoin: true,
            });
        }
    }
}
