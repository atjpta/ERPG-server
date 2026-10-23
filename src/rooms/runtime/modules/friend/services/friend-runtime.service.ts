/**
 * Id bạn bè của những người đang kết nối global room (nạp từ DB lúc vào, dọn lúc rời), giữ trong bộ nhớ process. Dùng để đẩy presence
 * mà không phải query DB mỗi lần. Chỉ đổi dữ liệu, không gửi message (xem `friendGlobalService`).
 */
export class FriendRuntimeService {
    private readonly friendIdsByPlayerId = new Map<string, Set<string>>();

    /** `undefined` = người này không kết nối global (chưa nạp). */
    friendIdsOf(playerId: string): ReadonlySet<string> | undefined {
        return this.friendIdsByPlayerId.get(playerId);
    }

    load(playerId: string, friendIds: readonly string[]) {
        this.friendIdsByPlayerId.set(playerId, new Set(friendIds));
    }

    unload(playerId: string) {
        this.friendIdsByPlayerId.delete(playerId);
    }

    /** Hai người vừa thành bạn: cập nhật bản của người nào đang được nạp. */
    link(a: string, b: string) {
        this.friendIdsByPlayerId.get(a)?.add(b);
        this.friendIdsByPlayerId.get(b)?.add(a);
    }

    unlink(a: string, b: string) {
        this.friendIdsByPlayerId.get(a)?.delete(b);
        this.friendIdsByPlayerId.get(b)?.delete(a);
    }
}
