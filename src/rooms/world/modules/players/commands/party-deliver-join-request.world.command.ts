import type { PartyJoinRequestMessage } from "@/rooms/world/types/world-message.type.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { playerPartyWorldService } from "@/rooms/world/modules/players/services/player-party.world.service.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface Payload {
    leaderId: string;
    message: PartyJoinRequestMessage;
}

/** RPC từ party: chuyển lời xin vào party tới chủ đang ở room này. Kết quả: có gửi được không. */
export class PartyDeliverJoinRequestWorldCommand extends Command<WorldRoom, Payload> {
    result = false;

    execute({ leaderId, message }: Payload) {
        const found = playerPartyWorldService.findPlayer(this.room, leaderId);
        if (!found) return;
        found.client.send(WorldMessage.PARTY_JOIN_REQUEST, message);
        this.result = true;
    }
}
