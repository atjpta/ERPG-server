import { matchMaker } from "colyseus";
import type { PlayerRenamedMessage } from "@/core/types/player-rename.type.js";
import { playerRenameTopic } from "@/core/utils/player-rename.util.js";

/**
 * Báo các room realtime (mọi process, qua presence pub/sub như `PlayerKickService`) rằng người chơi vừa đổi tên để họ cập nhật
 * tên trong phiên đang chạy. Gọi SAU khi DB đã ghi tên mới.
 */
export class PlayerRenameService {
    publish(playerId: string, name: string) {
        const message: PlayerRenamedMessage = { playerId, name };
        // `matchMaker.presence` chỉ có khi server Colyseus đã khởi động (không có trong seed/test).
        matchMaker.presence?.publish(playerRenameTopic(playerId), message);
    }
}

export const playerRenameService = new PlayerRenameService();
