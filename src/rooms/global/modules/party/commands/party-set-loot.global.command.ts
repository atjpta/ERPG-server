import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import {
    PartyMemberGlobalCommand,
    type PartyCommandPayload,
} from "@/rooms/global/modules/party/commands/party-member.global.command.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { PartyLootSchema } from "@/rooms/global/modules/party/validators/loot.party.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PartyErrorCode } from "@/rooms/global/modules/party/enums/party-error-code.enum.js";

@SdkMessage({
    errors: [PartyErrorCode.PARTY_NOT_MEMBER, PartyErrorCode.PARTY_NOT_LEADER],
    note: "Thành công: mọi thành viên nhận `partyState` mới.",
})
export class PartySetLootGlobalCommand extends PartyMemberGlobalCommand<typeof PartyLootSchema> {
    static readonly message = GlobalClientMessage.PARTY_SET_LOOT;

    protected override readonly validateSchema = PartyLootSchema;
    protected override readonly leaderOnly = true;

    execute({ client }: PartyCommandPayload) {
        const { room, party } = this;
        const error = party.setLootMode(client.auth.playerId, this.body.mode);
        if (error) {
            this.result = Response.error(error);
            return;
        }
        // World room của từng thành viên cần biết cách chia mới để chia item lúc hạ quái.
        for (const playerId of party.members.keys()) {
            void partyGlobalService.publishMembership(room, party, playerId, party.id);
        }
        partyNotifyGlobalService.broadcastState(room, party);
        this.result = Response.success();
    }
}
