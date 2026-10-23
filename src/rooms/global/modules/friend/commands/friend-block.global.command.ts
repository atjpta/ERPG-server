import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import { isFriendFailure } from "@/modules/friends/services/friendship.service.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import type { BlockedEntryMessage } from "@/rooms/global/modules/friend/interfaces/friend.global.message.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { FriendNameSchema } from "@/rooms/global/modules/friend/validators/friend.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "BlockedEntryMessage",
    errors: [
        CommonCode.INVALID_INPUT,
        FriendErrorCode.FRIEND_TARGET_NOT_FOUND,
        FriendErrorCode.FRIEND_SELF_TARGET,
        FriendErrorCode.FRIEND_BLOCK_LIST_FULL,
    ],
    note: "Đang là bạn / có lời mời với người đó thì quan hệ bị xoá (họ nhận `friendChanged` `removed`). Chặn người đã chặn là no-op.",
})
export class FriendBlockGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof FriendNameSchema
> {
    static readonly message = GlobalClientMessage.FRIEND_BLOCK;

    protected override readonly validateSchema = FriendNameSchema;

    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const selfId = client.auth.playerId;
        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: room.serverId,
            name: this.body.playerName,
        });
        if (!target) {
            this.result = Response.error(FriendErrorCode.FRIEND_TARGET_NOT_FOUND);
            return;
        }
        const outcome = await playerBlockService.block({ blockerId: selfId, blockedId: target.id });
        if (isFriendFailure(outcome)) {
            this.result = Response.error(outcome.code, undefined, outcome.data ?? null);
            return;
        }
        if (outcome.removedFriendship) {
            friendGlobalService.unlinkAndNotify(
                room,
                { playerId: selfId, name: this.player.name },
                target.id
            );
        }
        this.result = Response.success<BlockedEntryMessage>({
            playerId: target.id,
            name: target.name,
        });
    }
}
