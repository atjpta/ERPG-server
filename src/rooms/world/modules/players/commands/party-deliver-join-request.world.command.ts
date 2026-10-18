import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { Result } from "@/core/types/result.type.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { sendOk } from "@/core/utils/room-send.util.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import {
    WorldMessage,
    type PartyJoinRequestMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    leaderId: string;
    message: PartyJoinRequestMessage;
}

/** RPC từ party: chuyển lời xin vào party tới chủ đang ở room này. */
export class PartyDeliverJoinRequestWorldCommand extends Command<WorldRoom, Payload> {
    result: Result = fail(CommonCode.ROOM_UNAVAILABLE);

    execute({ leaderId, message }: Payload) {
        const found = playerPartyWorldService.findPlayer(this.room, leaderId);
        if (!found) {
            this.result = fail(PlayerErrorCode.PLAYER_OFFLINE);
            return;
        }
        sendOk(found.client, WorldMessage.PARTY_JOIN_REQUEST, message);
        this.result = ok();
    }
}
