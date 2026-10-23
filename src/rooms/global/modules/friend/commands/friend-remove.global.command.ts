import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import {
    friendshipService,
    isFriendFailure,
} from "@/modules/friends/services/friendship.service.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { FriendTargetSchema } from "@/rooms/global/modules/friend/validators/friend.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    errors: [CommonCode.INVALID_INPUT, FriendErrorCode.FRIEND_NOT_FRIEND],
    note: "Thành công: response rỗng; người kia (nếu online) nhận `friendChanged` (`removed`).",
})
export class FriendRemoveGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof FriendTargetSchema
> {
    static readonly message = GlobalClientMessage.FRIEND_REMOVE;

    protected override readonly validateSchema = FriendTargetSchema;

    async execute({ client }: PlayerCommandPayload) {
        const selfId = client.auth.playerId;
        const friendId = this.body.playerId;
        const failure = await friendshipService.remove({ playerId: selfId, friendId });
        if (isFriendFailure(failure)) {
            this.result = Response.error(failure.code, undefined, failure.data ?? null);
            return;
        }
        friendGlobalService.unlinkAndNotify(
            this.room,
            { playerId: selfId, name: this.player.name },
            friendId
        );
        this.result = Response.success();
    }
}
