import { matchMaker } from "colyseus";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import type { KickFilter, KickMessage } from "@/core/types/player-kick.type.js";
import { userKickTopic } from "@/core/utils/player-kick.util.js";

/**
 * Đá player đang online khỏi room realtime qua presence pub/sub của Colyseus — memory presence khi chạy
 * 1 process, `RedisPresence` (có `REDIS_URI`) thì tới được room ở mọi process.
 * Gọi SAU khi DB đã commit (ban/xoá/revoke session), để room kiểm tra lại DB là thấy trạng thái mới.
 */
export class PlayerKickService {
    kickUser(userId: string, reason: KickReason, filter: KickFilter = {}) {
        const message: KickMessage = { reason, ...filter };
        // `matchMaker.presence` chỉ có khi server Colyseus đã khởi động (không có trong seed/test).
        matchMaker.presence?.publish(userKickTopic(userId), message);
    }

    kickPlayer(userId: string, playerId: string, reason: KickReason) {
        this.kickUser(userId, reason, { playerId });
    }

    kickSession(userId: string, userSessionId: string, reason = KickReason.SESSION_REVOKED) {
        this.kickUser(userId, reason, { userSessionId });
    }
}

export const playerKickService = new PlayerKickService();
