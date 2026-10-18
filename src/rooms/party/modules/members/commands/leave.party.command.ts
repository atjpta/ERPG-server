import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";

export class LeavePartyCommand extends Command<PartyRoom, { client: PlayerClient }> {
    static readonly message = PartyClientMessage.LEAVE;

    execute({ client }: { client: PlayerClient }) {
        return new RemovePlayerPartyCommand().setPayload({
            playerId: client.auth.playerId,
            code: PartyNotice.MEMBER_LEFT,
        });
    }
}
