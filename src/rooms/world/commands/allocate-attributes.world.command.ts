import { Command } from "@colyseus/command";
import { AllocateAttributesSchema } from "@/rooms/world/validators/allocate-attributes.world.validator.js";
import { attributeWorldService } from "@/rooms/world/services/attribute.world.service.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

interface AllocateAttributesPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Player cộng điểm tiềm năng (`attributePoints`) vào attribute. Chỉ đổi state trong room — checkpoint /
 * lúc rời room lưu DB; stat (HP, attack…) tính lại ngay. Kết quả (hoặc lỗi) gửi lại riêng cho client đó.
 */
export class AllocateAttributesWorldCommand extends Command<WorldRoom, AllocateAttributesPayload> {
    execute({ client, payload }: AllocateAttributesPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = AllocateAttributesSchema.safeParse(payload);
        const error = !parsed.success
            ? "Invalid payload"
            : player.hp <= 0
              ? "Player is dead"
              : player.allocateAttributes(parsed.data);

        attributeWorldService.send(client, player, error);
    }
}

/** Tính thử kết quả cộng điểm (cho client hiện bảng xác nhận "100 → 110") — không đổi state. */
export class PreviewAttributesWorldCommand extends Command<WorldRoom, AllocateAttributesPayload> {
    execute({ client, payload }: AllocateAttributesPayload) {
        const player = this.room.state.players.get(client.sessionId);
        if (!player) return;

        const parsed = AllocateAttributesSchema.safeParse(payload);
        const preview = parsed.success ? player.previewAttributes(parsed.data) : "Invalid payload";
        attributeWorldService.sendPreview(client, player, preview);
    }
}
