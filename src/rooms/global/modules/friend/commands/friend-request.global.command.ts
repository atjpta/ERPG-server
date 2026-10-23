import { cacheService } from "@/core/cache/cache.service.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/utils/response.util.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { FriendErrorCode } from "@/modules/friends/enums/friend-error-code.enum.js";
import {
    friendshipService,
    isFriendFailure,
} from "@/modules/friends/services/friendship.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { FriendChange } from "@/rooms/global/modules/friend/enums/friend-change.enum.js";
import { FriendNotice } from "@/rooms/global/modules/friend/enums/friend-notice.enum.js";
import type { FriendNoticeMessage } from "@/rooms/global/modules/friend/interfaces/friend.global.message.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { FriendNameSchema } from "@/rooms/global/modules/friend/validators/friend.validator.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "FriendNoticeMessage",
    errors: [
        CommonCode.INVALID_INPUT,
        CommonCode.TOO_MANY_REQUESTS,
        FriendErrorCode.FRIEND_TARGET_NOT_FOUND,
        FriendErrorCode.FRIEND_SELF_TARGET,
        FriendErrorCode.FRIEND_ALREADY_FRIENDS,
        FriendErrorCode.FRIEND_REQUEST_EXISTS,
        FriendErrorCode.FRIEND_BLOCKED_BY_YOU,
        FriendErrorCode.FRIEND_LIST_FULL,
        FriendErrorCode.FRIEND_TARGET_LIST_FULL,
        FriendErrorCode.FRIEND_TOO_MANY_SENT,
        FriendErrorCode.FRIEND_TARGET_TOO_MANY_PENDING,
    ],
    note: "Thành công: notice `request_sent` (người nhận, kể cả khi offline, thấy lời mời qua `friendChanged` / `friendList`) hoặc `friend_added` nếu họ đã mời bạn trước. Lỗi có thể kèm `error.max`.",
})
export class FriendRequestGlobalCommand extends PlayerGlobalCommand<
    PlayerCommandPayload,
    typeof FriendNameSchema
> {
    static readonly message = GlobalClientMessage.FRIEND_REQUEST;

    protected override readonly validateSchema = FriendNameSchema;

    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const selfId = client.auth.playerId;

        // Chống spam lời mời (cache dùng chung nhiều process).
        const { limit, windowSeconds } = masterDataCacheService.get(
            MasterDataKey.FRIEND_CONFIG
        ).requestRateLimit;
        const sent = await cacheService.incr(`friend:request-rate:${selfId}`, windowSeconds);
        if (sent > limit) {
            this.result = Response.error(CommonCode.TOO_MANY_REQUESTS, undefined, {
                retryAfterSeconds: windowSeconds,
            });
            return;
        }

        const target = await PlayerIdentityRepo.findByServerAndName({
            serverId: room.serverId,
            name: this.body.playerName,
        });
        if (!target) {
            this.result = Response.error(FriendErrorCode.FRIEND_TARGET_NOT_FOUND);
            return;
        }

        const outcome = await friendshipService.sendRequest({ fromId: selfId, toId: target.id });
        if (isFriendFailure(outcome)) {
            this.result = Response.error(outcome.code, undefined, outcome.data ?? null);
            return;
        }

        const self = { playerId: selfId, name: this.player.name };
        if (outcome.kind === "accepted") {
            friendGlobalService.linkAndNotify(room, self, target.id);
        } else {
            friendGlobalService.pushChange(room, target.id, FriendChange.REQUEST_RECEIVED, self);
        }
        this.result = Response.success<FriendNoticeMessage>({
            notice:
                outcome.kind === "accepted" ? FriendNotice.FRIEND_ADDED : FriendNotice.REQUEST_SENT,
            playerName: target.name,
        });
    }
}
