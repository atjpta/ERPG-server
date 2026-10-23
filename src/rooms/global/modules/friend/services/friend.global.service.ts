import { RoomResponse } from "@/core/response/room-response.js";
import { friendshipService } from "@/modules/friends/services/friendship.service.js";
import type { GlobalRoom } from "@/rooms/global/global.room.js";
import { FriendChange } from "@/rooms/global/modules/friend/enums/friend-change.enum.js";
import type {
    FriendChangedMessage,
    FriendEntryMessage,
    FriendPresenceMessage,
} from "@/rooms/global/modules/friend/interfaces/friend.global.message.js";
import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";

/** Điều phối friend trong global room: nạp bạn bè lúc vào, presence, danh sách và push thay đổi. Không giữ state riêng. */
export class FriendGlobalService {
    /** Người chơi vừa kết nối global: nạp danh sách bạn và báo họ online. */
    async connect(room: GlobalRoom, playerId: string) {
        room.friends.load(playerId, await friendshipService.findFriendIds({ playerId }));
        this.announcePresence(room, playerId);
    }

    /** Kết nối global của người chơi đã kết thúc: báo offline rồi dọn. */
    disconnect(room: GlobalRoom, playerId: string) {
        this.announcePresence(room, playerId, { online: false });
        room.friends.unload(playerId);
    }

    /** Đẩy presence hiện tại của `playerId` cho các bạn đang online (người chưa kết nối global thì bỏ qua). */
    announcePresence(room: GlobalRoom, playerId: string, override?: { online: false }) {
        const friendIds = room.friends.friendIdsOf(playerId);
        if (!friendIds) return;
        const presence: FriendPresenceMessage = override
            ? { playerId, online: false }
            : { playerId, ...this.presenceOf(room, playerId) };
        for (const friendId of friendIds) {
            this.sendTo(room, friendId, GlobalMessage.FRIEND_PRESENCE, presence);
        }
    }

    /** `playerId` vừa đổi tên: báo các bạn đang online để họ đổi tên trong danh sách. */
    announceRename(room: GlobalRoom, playerId: string, name: string) {
        const friendIds = room.friends.friendIdsOf(playerId);
        if (!friendIds) return;
        for (const friendId of friendIds) {
            this.pushChange(room, friendId, FriendChange.RENAMED, { playerId, name });
        }
    }

    presenceOf(
        room: GlobalRoom,
        playerId: string
    ): Pick<FriendPresenceMessage, "online" | "mapCode"> {
        const online = room.sessionOf.has(playerId);
        const presence = room.players.get(playerId)?.presence;
        return { online, ...(online && presence ? { mapCode: presence.mapCode } : {}) };
    }

    entryOf(
        room: GlobalRoom,
        friend: { playerId: string; name: string; since: number }
    ): FriendEntryMessage {
        return { ...friend, ...this.presenceOf(room, friend.playerId) };
    }

    /** Hai người vừa thành bạn: cập nhật bản nạp sẵn và báo `friendId` (nếu online) có bạn mới là `self`. */
    linkAndNotify(room: GlobalRoom, self: { playerId: string; name: string }, friendId: string) {
        room.friends.link(self.playerId, friendId);
        this.pushChange(room, friendId, FriendChange.ADDED, {
            ...self,
            friend: this.entryOf(room, { ...self, since: Date.now() }),
        });
    }

    /** Hai người không còn là bạn: cập nhật bản nạp sẵn và báo `otherId` (nếu online) bỏ `self` khỏi danh sách. */
    unlinkAndNotify(room: GlobalRoom, self: { playerId: string; name: string }, otherId: string) {
        room.friends.unlink(self.playerId, otherId);
        this.pushChange(room, otherId, FriendChange.REMOVED, self);
    }

    /** Đẩy `friendChanged` tới `toPlayerId` nếu họ đang kết nối global. */
    pushChange(
        room: GlobalRoom,
        toPlayerId: string,
        change: FriendChange,
        who: { playerId: string; name: string; friend?: FriendEntryMessage }
    ) {
        const data: FriendChangedMessage = { change, ...who };
        this.sendTo(room, toPlayerId, GlobalMessage.FRIEND_CHANGED, data);
    }

    private sendTo(room: GlobalRoom, playerId: string, type: GlobalMessage, data: unknown) {
        const client = room.clientOf(playerId);
        if (client) RoomResponse.send(client, type, data);
    }
}

export const friendGlobalService = new FriendGlobalService();
