import { PartyErrorCode } from "@/rooms/party/types/party-error-code.type.js";
import { PartyMessage } from "@/rooms/party/types/party-message.type.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyLootSchema } from "@/rooms/party/modules/loot/validators/loot.party.validator.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyClientMessage } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { publishMembership } from "@/rooms/party/services/party-membership.js";
import { noticeError } from "@/rooms/party/services/party-notify.js";

@SdkMessage({
    replies: [PartyMessage.NOTICE],
    errors: [PartyErrorCode.PARTY_NOT_LEADER],
})
export class SetLootPartyCommand extends Command<
    PartyRoom,
    { client: PlayerClient; payload?: unknown }
> {
    static readonly message = PartyClientMessage.SET_LOOT;

    execute({ client, payload }: { client: PlayerClient; payload?: unknown }) {
        const parsed = PartyLootSchema.safeParse(payload);
        if (!parsed.success) return;
        const error = this.room.state.setLootMode(client.auth.playerId, parsed.data.mode);
        if (error) return noticeError(client, error);
        // World room của từng thành viên cần biết cách chia mới để chia item lúc hạ quái.
        for (const [playerId, worldRoomId] of this.room.worldRoomOf) {
            void publishMembership(this.room, worldRoomId, playerId, this.room.roomId);
        }
    }
}
