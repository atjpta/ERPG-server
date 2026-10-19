import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import { DeclineInvitePartyCommand } from "@/rooms/party/commands/decline-invite.party.command.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyDeclineSchema } from "@/rooms/world/modules/players/validators/party.world.validator.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    note: "Không có reply.",
})
export class PartyDeclineWorldCommand extends Command<WorldRoom, PartyPayload> {
    static readonly message = WorldClientMessage.PARTY_DECLINE;

    async execute({ client, payload }: PartyPayload) {
        const player = this.room.state.players.get(client.auth.playerId);
        const parsed = PartyDeclineSchema.safeParse(payload);
        if (!player || !parsed.success) return;
        await callRoom(parsed.data.partyRoomId, DeclineInvitePartyCommand, { playerId: player.id });
    }
}
