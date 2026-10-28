import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PartyErrorCode } from "@/modules/party/enums/party-error-code.enum.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";
import type { PartyStateMessage } from "@/rooms/global/modules/party/interfaces/party.global.message.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";

@SdkMessage({
    response: "PartyStateMessage",
    errors: [PartyErrorCode.PARTY_NOT_MEMBER],
    note: "Gọi lúc vào game (và sau khi reconnect); không ở party nào thì `PARTY_NOT_MEMBER`. Sau đó cập nhật theo push `partyState` / `partyLeft`.",
})
export class GetPartyGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.GET_PARTY;

    execute() {
        const party = this.room.parties.getPartyByPlayerId(this.player.playerId);
        this.result = party
            ? Response.success<PartyStateMessage>(partyNotifyGlobalService.snapshotOf(party))
            : Response.error(PartyErrorCode.PARTY_NOT_MEMBER);
    }
}
