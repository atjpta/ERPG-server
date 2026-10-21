import { PlayerCommand, type PlayerCommandPayload } from "@/core/rooms/player.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import type { z } from "zod";

/** Command của thành viên party room: `this.player` là `playerId` (phải đang là thành viên) — xem `PlayerCommand`. */
export abstract class PlayerPartyCommand<
    TPayload extends PlayerCommandPayload = PlayerCommandPayload,
    TSchema extends z.ZodType = z.ZodUndefined,
> extends PlayerCommand<PartyRoom, string, TPayload, TSchema> {
    protected findPlayer(room: PartyRoom, playerId: string) {
        return room.state.has(playerId) ? playerId : undefined;
    }
}
