import { PlayerCommand, type PlayerCommandPayload } from "@/core/rooms/player.command.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { z } from "zod";

/** Command của người đang kết nối global room: `this.player` là `PlayerRuntime` của họ — xem `PlayerCommand`. */
export abstract class PlayerGlobalCommand<
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerCommand<GlobalRoom, PlayerRuntime, TPayload, TSchema> {
    protected findPlayer(room: GlobalRoom, playerId: string) {
        return room.sessionOf.has(playerId) ? this.room.runtime.players.get(playerId) : undefined;
    }
}
