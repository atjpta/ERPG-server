import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { callRoom } from "@/core/rooms/room.integration.js";
import { DeclineInvitePartyCommand } from "@/rooms/party/commands/decline-invite.party.command.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyDeclineSchema } from "@/rooms/world/modules/players/validators/party.world.validator.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import { PlayerWorldCommand } from "@/rooms/world/commands/player.world.command.js";

interface PartyPayload {
    client: PlayerClient;
    payload: unknown;
}

@SdkMessage({
    note: "Không có reply.",
})
export class PartyDeclineWorldCommand extends PlayerWorldCommand<
    PartyPayload,
    typeof PartyDeclineSchema
> {
    static readonly message = WorldClientMessage.PARTY_DECLINE;

    protected override readonly validateSchema = PartyDeclineSchema;

    async execute() {
        await callRoom(this.body.partyRoomId, DeclineInvitePartyCommand, {
            playerId: this.player.id,
        });
    }
}
