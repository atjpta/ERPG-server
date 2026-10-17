import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { WorldMessage, type AttributesMessage } from "@/rooms/world/types/world-message.type.js";

/** Gửi điểm tiềm năng, attribute và stat hiện tại của player cho đúng client đó. */
export class AttributeWorldService {
    send(client: PlayerClient | undefined, player: PlayerWorldState, error?: string) {
        if (!client) return;
        const message: AttributesMessage = {
            ok: !error,
            ...(error ? { error } : {}),
            ...player.getAttributeSummary(),
        };
        client.send(WorldMessage.ATTRIBUTES, message);
    }
}

export const attributeWorldService = new AttributeWorldService();
