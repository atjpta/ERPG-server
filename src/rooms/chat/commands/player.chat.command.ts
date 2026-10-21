import { PlayerCommand, type PlayerCommandPayload } from "@/core/rooms/player.command.js";
import type { ChatRoom } from "@/rooms/chat/chat.room.js";
import type { z } from "zod";

/** Command của người đang kết nối chat room: `this.player` là `playerId` — xem `PlayerCommand`. */
export abstract class PlayerChatCommand<
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerCommand<ChatRoom, string, TPayload, TSchema> {
    protected findPlayer(room: ChatRoom, playerId: string) {
        return room.sessionOf.has(playerId) ? playerId : undefined;
    }
}
