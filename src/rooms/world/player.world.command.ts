import { PlayerCommand, type PlayerCommandPayload } from "@/core/rooms/player.command.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import type { z } from "zod";

export type { PlayerCommandPayload };

/** Command của player trong world room: `this.player` là `PlayerWorldState` — xem `PlayerCommand`. */
export abstract class PlayerWorldCommand<
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerCommand<WorldRoom, PlayerWorldState, TPayload, TSchema> {
    protected findPlayer(room: WorldRoom, playerId: string) {
        return room.state.players.get(playerId);
    }
}
