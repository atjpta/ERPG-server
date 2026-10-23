import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PartyCommandPayload } from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import type { PartyStateMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";

/** Tạo party (hoặc lấy lại party hiện có) của người gửi. */
@SdkMessage({
    response: "PartyStateMessage",
    errors: [PlayerErrorCode.PLAYER_OFFLINE],
    note: "Đã có party thì trả lại party đó. Cần đã vào world room (server biết thông tin nhân vật), không thì `PLAYER_OFFLINE`. Trạng thái party về sau đến qua `partyState`.",
})
export class PartyCreateGlobalCommand extends PlayerGlobalCommand<PartyCommandPayload> {
    static readonly message = GlobalClientMessage.PARTY_CREATE;

    execute({ client }: PartyCommandPayload) {
        const { playerId } = client.auth;
        let party = this.room.runtime.parties.getPartyByPlayerId(playerId);
        if (!party) {
            const player = this.player;
            if (!player.presence) {
                this.result = Response.error(PlayerErrorCode.PLAYER_OFFLINE);
                return;
            }
            party = this.room.runtime.parties.create(player);
            partyGlobalService.publishMembership(this.room, party, player.playerId, party.id);
            partyNotifyGlobalService.broadcastState(this.room, party);
        }
        this.result = Response.success<PartyStateMessage>(
            partyNotifyGlobalService.snapshotOf(party)
        );
    }
}
