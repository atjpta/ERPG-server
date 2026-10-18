import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { PartyTargetSchema } from "@/rooms/party/modules/members/validators/member.party.validator.js";
import type { PartyRoom } from "@/rooms/party/party.room.js";
import { PartyClientMessage, PartyNotice } from "@/rooms/party/types/party-message.type.js";
import { Command } from "@colyseus/command";
import { broadcastNotice, noticeError } from "@/rooms/party/services/party-notify.js";

interface Payload {
    client: PlayerClient;
    payload?: unknown;
}

export class PromotePartyCommand extends Command<PartyRoom, Payload> {
    static readonly message = PartyClientMessage.PROMOTE;

    async execute({ client, payload }: Payload) {
        const parsed = PartyTargetSchema.safeParse(payload);
        if (!parsed.success) return;
        const error = this.room.state.promote(client.auth.playerId, parsed.data.playerId);
        if (error) return noticeError(client, error, this.room.state.nameOf(parsed.data.playerId));
        broadcastNotice(
            this.room,
            PartyNotice.LEADER_CHANGED,
            this.room.state.nameOf(parsed.data.playerId)
        );
    }
}
