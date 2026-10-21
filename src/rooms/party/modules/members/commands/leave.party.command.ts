import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { PlayerPartyCommand } from "@/rooms/party/commands/player.party.command.js";

@SdkMessage({
    replies: [PartyMessage.NOTICE],
    note: "Thành công: notice `member_left`.",
})
export class LeavePartyCommand extends PlayerPartyCommand<{ client: PlayerClient }> {
    static readonly message = PartyClientMessage.LEAVE;

    execute({ client }: { client: PlayerClient }) {
        return new RemovePlayerPartyCommand().setPayload({
            playerId: client.auth.playerId,
            code: PartyNotice.MEMBER_LEFT,
        });
    }
}
