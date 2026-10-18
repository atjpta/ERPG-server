import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { sendOk } from "@/core/utils/room-send.util.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";

/** Gửi điểm tiềm năng, attribute và stat hiện tại của player cho đúng client đó. */
export class AttributeWorldService {
    send(client: PlayerClient | undefined, player: PlayerWorldState) {
        if (client) sendOk(client, WorldMessage.ATTRIBUTES, player.getAttributeSummary());
    }
}

export const attributeWorldService = new AttributeWorldService();
