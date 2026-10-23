import type { PlayerCommandPayload } from "@/core/rooms/player.command.js";
import { SdkMessage } from "@/core/rooms/sdk-room.decorator.js";
import { Response } from "@/core/response/response.js";
import { friendshipService } from "@/modules/friends/services/friendship.service.js";
import { playerBlockService } from "@/modules/friends/services/player-block.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { FriendListMessage } from "@/rooms/global/modules/friend/interfaces/friend.global.message.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { GlobalClientMessage } from "@/rooms/global/types/global-message.type.js";
import { PlayerGlobalCommand } from "@/rooms/global/player.global.command.js";

@SdkMessage({
    response: "FriendListMessage",
    note: "Gọi lúc vào game; sau đó cập nhật theo push `friendChanged` / `friendPresence`.",
})
export class FriendListGlobalCommand extends PlayerGlobalCommand {
    static readonly message = GlobalClientMessage.FRIEND_LIST;

    /** Toàn bộ friend của người gọi: bạn (kèm presence), lời mời đã nhận / đã gửi, người bị chặn. */
    async execute({ client }: PlayerCommandPayload) {
        const { room } = this;
        const playerId = client.auth.playerId;
        const [lists, blocked] = await Promise.all([
            friendshipService.listFor(playerId),
            playerBlockService.listFor(playerId),
        ]);
        this.result = Response.success<FriendListMessage>({
            friends: lists.friends.map((friend) => friendGlobalService.entryOf(room, friend)),
            received: lists.received,
            sent: lists.sent,
            blocked,
            maxFriends: masterDataCacheService.get(MasterDataKey.FRIEND_CONFIG).maxFriends,
        });
    }
}
