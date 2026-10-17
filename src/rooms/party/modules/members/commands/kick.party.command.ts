import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PARTY_NOTICE_BY_ERROR } from "@/rooms/party/constants/party-notice.constant.js";
import { PartyTargetSchema } from "@/rooms/party/modules/members/validators/member.party.validator.js";
import { RemovePlayerPartyCommand } from "@/rooms/party/modules/members/commands/remove-player.party.command.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyClientMessage, PartyNoticeCode } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { notice } from "@/rooms/party/services/party-notify.js";

interface Payload {
    client: PlayerClient;
    payload?: unknown;
}

export class KickPartyCommand extends Command<PartyRoom, Payload> {
    static readonly message = PartyClientMessage.KICK;

    execute({ client, payload }: Payload) {
        const parsed = PartyTargetSchema.safeParse(payload);
        if (!parsed.success) return;
        const targetId = parsed.data.playerId;
        const error = this.room.state.checkTarget(client.auth.playerId, targetId);
        if (error) {
            return notice(client, PARTY_NOTICE_BY_ERROR[error], this.room.state.nameOf(targetId));
        }
        return new RemovePlayerPartyCommand().setPayload({
            playerId: targetId,
            code: PartyNoticeCode.KICKED,
        });
    }
}
