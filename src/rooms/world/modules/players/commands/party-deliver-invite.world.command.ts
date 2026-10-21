import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import type { PartyMemberInfo } from "@/rooms/party/party.shared.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import {
    WorldMessage,
    type PartyInviteReceivedMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    playerId: string;
    message: PartyInviteReceivedMessage;
}

/** RPC từ party: gửi lời mời cho người đang ở room này. Kết quả: thông tin người được mời. */
export class PartyDeliverInviteWorldCommand extends Command<WorldRoom, Payload> {
    result: Result<PartyMemberInfo> = fail(CommonCode.ROOM_UNAVAILABLE);

    private found!: NonNullable<ReturnType<typeof playerPartyWorldService.findPlayer>>;

    validate({ playerId }: Payload) {
        const found = playerPartyWorldService.findPlayer(this.room, playerId);
        if (!found) {
            this.result = fail(PlayerErrorCode.PLAYER_OFFLINE);
            return false;
        }
        this.found = found;
        return true;
    }

    execute({ message }: Payload) {
        const { found } = this;
        found.client.sendSuccess(WorldMessage.PARTY_INVITE_RECEIVED, message);
        this.result = ok(playerPartyWorldService.toMemberInfo(this.room, found.player));
    }
}
