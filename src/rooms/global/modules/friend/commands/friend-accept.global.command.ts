import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import { friendshipService } from "@/modules/friends/services/friendship.service.js";
import { FriendNotice } from "@/rooms/global/modules/friend/enums/friend-notice.enum.js";
import type { FriendNoticeMessage } from "@/rooms/global/modules/friend/interfaces/friend.global.message.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { FriendTargetSchema } from "@/rooms/global/modules/friend/validators/friend.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "FriendNoticeMessage",
    errors: [
        CommonCode.INVALID_INPUT,
        FriendErrorCode.FRIEND_NO_REQUEST,
        FriendErrorCode.FRIEND_LIST_FULL,
        FriendErrorCode.FRIEND_TARGET_LIST_FULL,
    ],
    note: "Thành công: notice `friend_added`; người gửi lời mời (nếu online) nhận `friendChanged` (`added`).",
})
export class FriendAcceptGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof FriendTargetSchema
> {
    static readonly message = GlobalClientMessage.FRIEND_ACCEPT;

    protected override readonly validateSchema = FriendTargetSchema;

    async execute({ client }: PlayerCommandPayload) {
        const selfId = client.auth.playerId;
        const fromId = this.body.playerId;

        const outcome = await friendshipService.accept({ playerId: selfId, fromId });
        if (Response.isError(outcome)) {
            this.result = outcome;
            return;
        }
        const from = await PlayerIdentityRepo.findById({ id: fromId });
        friendGlobalService.linkAndNotify(
            this.room,
            { playerId: selfId, name: this.player.name },
            fromId
        );
        this.result = Response.success<FriendNoticeMessage>({
            notice: FriendNotice.FRIEND_ADDED,
            playerName: from?.name ?? "",
        });
    }
}
