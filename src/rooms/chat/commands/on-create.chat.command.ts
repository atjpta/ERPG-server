import type { ChatRoom } from "@/rooms/chat/chat.room.js";
import type { ChatJoinOptions } from "@/rooms/chat/types/chat-room.type.js";
import { Command } from "@colyseus/command";

export class OnCreateChatCommand extends Command<ChatRoom, ChatJoinOptions> {
    execute(options: ChatJoinOptions) {
        this.room.serverId = options.serverId;
    }
}
