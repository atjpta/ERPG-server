import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { sendFail } from "@/core/utils/room-send.util.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { attributeWorldService } from "@/rooms/world/modules/players/services/attribute.world.service.js";
import { AllocateAttributesSchema } from "@/rooms/world/modules/players/validators/allocate-attributes.world.validator.js";
import { WorldClientMessage, WorldMessage } from "@/rooms/world/types/world-message.type.js";
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
@SdkMessage({
    replies: [WorldMessage.ATTRIBUTES],
    errors: [
        CommonCode.INVALID_INPUT,
        PlayerErrorCode.PLAYER_DEAD,
        PlayerErrorCode.ATTRIBUTE_NO_POINTS,
        PlayerErrorCode.ATTRIBUTE_POINTS_NOT_ENOUGH,
    ],
})
export class AllocateAttributesWorldCommand extends Command<WorldRoom, AllocateAttributesPayload> {
    static readonly message = WorldClientMessage.ALLOCATE_ATTRIBUTES;

    execute({ client, payload }: AllocateAttributesPayload) {
        const player = this.room.state.players.get(client.auth.playerId);
        if (!player) return;

        const parsed = AllocateAttributesSchema.safeParse(payload);
        const error = !parsed.success
            ? CommonCode.INVALID_INPUT
            : player.hp <= 0
              ? PlayerErrorCode.PLAYER_DEAD
              : player.allocateAttributes(parsed.data);

        if (error) sendFail(client, WorldMessage.ATTRIBUTES, error);
        else attributeWorldService.send(client, player);
    }
}
