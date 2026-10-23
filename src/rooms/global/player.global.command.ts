import { PlayerCommand, type PlayerCommandPayload } from "@/core/rooms/player.command.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { z } from "zod";

/** Command của người đang kết nối global room: `this.player` là `PlayerState` của họ — xem `PlayerCommand`. */
export abstract class PlayerGlobalCommand<
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerCommand<GlobalRoom, PlayerState, TPayload, TSchema> {
    protected findPlayer(room: GlobalRoom, playerId: string) {
        return room.sessionOf.has(playerId) ? this.room.players.get(playerId) : undefined;
    }
}
