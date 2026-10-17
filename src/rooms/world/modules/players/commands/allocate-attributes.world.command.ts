import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { attributeWorldService } from "@/rooms/world/modules/players/services/attribute.world.service.js";
import { AllocateAttributesSchema } from "@/rooms/world/modules/players/validators/allocate-attributes.world.validator.js";
import { WorldClientMessage } from "@/rooms/world/types/world-message.type.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { Command } from "@colyseus/command";

interface AllocateAttributesPayload {
    client: PlayerClient;
    payload: unknown;
}

/**
 * Player cộng điểm tiềm năng (`attributePoints`) vào attribute. Chỉ đổi state trong room — checkpoint /
 * lúc rời room lưu DB; stat (HP, attack…) tính lại ngay. Kết quả (hoặc lỗi) gửi lại riêng cho client đó.
 */
export class AllocateAttributesWorldCommand extends Command<WorldRoom, AllocateAttributesPayload> {
    static readonly message = WorldClientMessage.ALLOCATE_ATTRIBUTES;

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
