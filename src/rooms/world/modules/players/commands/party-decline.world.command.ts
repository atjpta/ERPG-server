import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { partyRoomRemote } from "@/rooms/party/party.remote.js";
import { PartyDeclineSchema } from "@/rooms/world/modules/players/validators/party.world.validator.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

export class PartyDeclineWorldCommand extends Command<WorldRoom, PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_DECLINE;

    async execute({ client, payload }: PartyPayload) {
        const player = this.room.state.players.get(client.sessionId);
        const parsed = PartyDeclineSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        await partyRoomRemote(parsed.data.partyRoomId).declineInvite(player.id);
    }
}
