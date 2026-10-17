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

/** RPC từ party: gửi lời mời cho người đang ở room này. Kết quả: thông tin người được mời, hoặc `null`. */
export class PartyDeliverInviteWorldCommand extends Command<WorldRoom, Payload> {
    result: PartyMemberInfo | null = null;

    execute({ playerId, message }: Payload) {
        const found = playerPartyWorldService.findPlayer(this.room, playerId);
        if (!found) return;
        found.client.send(WorldMessage.PARTY_INVITE_RECEIVED, message);
        this.result = playerPartyWorldService.toMemberInfo(this.room, found.player);
    }
}
