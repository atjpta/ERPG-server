import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyLootSchema } from "@/rooms/party/modules/loot/validators/loot.party.validator.js";
import { PartyClientMessage } from "@/rooms/party/types/party-message.type.js";
import { PlayerPartyCommand } from "@/rooms/party/commands/player.party.command.js";
import { publishMembership } from "@/rooms/party/services/party-membership.js";
import { noticeError } from "@/rooms/party/services/party-notify.js";

@SdkMessage({
    replies: [PartyMessage.NOTICE],
    errors: [PartyErrorCode.PARTY_NOT_LEADER],
})
export class SetLootPartyCommand extends PlayerPartyCommand<
    { client: PlayerClient; payload?: unknown },
    typeof PartyLootSchema
> {
    static readonly message = PartyClientMessage.SET_LOOT;

    protected override readonly validateSchema = PartyLootSchema;

    validate({ client }: { client: PlayerClient; payload?: unknown }) {
        if (this.room.state.isLeader(client.auth.playerId)) return true;
        noticeError(client, PartyErrorCode.PARTY_NOT_LEADER);
        return false;
    }

    execute({ client }: { client: PlayerClient }) {
        this.room.state.setLootMode(client.auth.playerId, this.body.mode);
        // World room của từng thành viên cần biết cách chia mới để chia item lúc hạ quái.
        for (const [playerId, worldRoomId] of this.room.worldRoomOf) {
            void publishMembership(this.room, worldRoomId, playerId, this.room.roomId);
        }
    }
}
