import { PlayerCommand, type PlayerCommandPayload } from "@/core/rooms/player.command.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import type { PlayerDataState } from "@/rooms/global/modules/player-data/schemas/player-data.global.state.js";
import type { z } from "zod";

/** Command của người đang kết nối global room: `this.player` là `PlayerDataState` của họ — xem `PlayerCommand`. */
export abstract class PlayerGlobalCommand<
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerCommand<GlobalRoom, PlayerDataState, TPayload, TSchema> {
    protected findPlayer(room: GlobalRoom, playerId: string) {
        return room.sessionOf.has(playerId) ? room.state.players.get(playerId) : undefined;
    }
}
