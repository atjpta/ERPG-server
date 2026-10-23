import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import { friendshipService } from "@/modules/friends/services/friendship.service.js";
import { FriendTargetSchema } from "@/rooms/global/modules/friend/validators/friend.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    errors: [CommonCode.INVALID_INPUT, FriendErrorCode.FRIEND_NO_REQUEST],
    note: "Thành công: response rỗng. Người gửi lời mời không được báo.",
})
export class FriendDeclineGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof FriendTargetSchema
> {
    static readonly message = GlobalClientMessage.FRIEND_DECLINE;

    protected override readonly validateSchema = FriendTargetSchema;

    async execute({ client }: PlayerCommandPayload) {
        this.result = await friendshipService.decline({
            playerId: client.auth.playerId,
            fromId: this.body.playerId,
        });
    }
}
