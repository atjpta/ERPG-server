import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import {
    WorldMessage,
    type AttributeSummary,
    type AttributesMessage,
} from "@/rooms/world/world.message.js";

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

    /** Trả lời `previewAttributes`: kết quả tính thử, hoặc lỗi kèm chỉ số hiện tại. */
    sendPreview(
        client: PlayerClient,
        player: PlayerWorldState,
        preview: AttributeSummary | string
    ) {
        const message: AttributesMessage =
            typeof preview === "string"
                ? { ok: false, error: preview, ...player.getAttributeSummary() }
                : { ok: true, ...preview };
        client.send(WorldMessage.ATTRIBUTES_PREVIEW, message);
    }
}

export const attributeWorldService = new AttributeWorldService();
