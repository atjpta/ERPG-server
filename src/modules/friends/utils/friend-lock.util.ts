import type { Queryable } from "@/configs/postgres.config.js";
import { lockKeys } from "@/core/utils/db-lock.util.js";

/**
 * Khoá mọi thao tác ghi bạn bè / chặn của các người chơi liên quan (kiểm tra block, đếm giới hạn rồi ghi phải là một khối).
 * Dùng trong transaction cho: gửi / nhận lời mời, chặn. Lấy theo thứ tự id đã sắp xếp nên không deadlock.
 */
export function lockFriendPlayers(tx: Queryable, ...playerIds: string[]) {
    return lockKeys(
        tx,
        playerIds.map((id) => `friends:${id}`)
    );
}
