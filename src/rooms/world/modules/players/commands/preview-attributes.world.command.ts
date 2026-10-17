import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import type { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { AllocateAttributesSchema } from "@/rooms/world/modules/players/validators/allocate-attributes.world.validator.js";
import {
    WorldClientMessage,
    WorldMessage,
    type AttributeSummary,
    type AttributesMessage,
} from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface AllocateAttributesPayload {
    client: PlayerClient;
    payload: unknown;
}

/** Tính thử kết quả cộng điểm (cho client hiện bảng xác nhận "100 → 110") — không đổi state. */
export class PreviewAttributesWorldCommand extends Command<WorldRoom, AllocateAttributesPayload> {
    static readonly message = WorldClientMessage.PREVIEW_ATTRIBUTES;

    execute({ client, payload }: AllocateAttributesPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = AllocateAttributesSchema.safeParse(payload);
        const preview = parsed.success ? player.previewAttributes(parsed.data) : "Invalid payload";
        this.sendPreview(client, player, preview);
    }

    /** Trả lời `previewAttributes`: kết quả tính thử, hoặc lỗi kèm chỉ số hiện tại. */
    private sendPreview(
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
