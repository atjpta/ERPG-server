import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import { isFriendFailure } from "@/modules/friends/services/friendship.service.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import { FriendTargetSchema } from "@/rooms/global/modules/friend/validators/friend.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    errors: [CommonCode.INVALID_INPUT, FriendErrorCode.FRIEND_NOT_BLOCKED],
    note: "Bỏ chặn không khôi phục quan hệ bạn bè đã bị xoá lúc chặn.",
})
export class FriendUnblockGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof FriendTargetSchema
> {
    static readonly message = GlobalClientMessage.FRIEND_UNBLOCK;

    protected override readonly validateSchema = FriendTargetSchema;

    async execute({ client }: PlayerCommandPayload) {
        const failure = await playerBlockService.unblock({
            blockerId: client.auth.playerId,
            blockedId: this.body.playerId,
        });
        this.result = isFriendFailure(failure)
            ? Response.error(failure.code, undefined, failure.data ?? null)
            : Response.success();
    }
}
