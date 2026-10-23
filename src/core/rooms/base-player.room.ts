import { Room, type AuthContext, type Client, type RoomOptions } from "colyseus";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import type { AuthPlayer } from "@/core/types/auth-player.type.js";
import { playerKickService } from "@/core/services/player-kick.service.js";
import { userKickTopic } from "@/core/utils/player-kick.util.js";
import type { ClientSend } from "@/core/utils/client-send.util.js";
import type { Result } from "@/core/types/result.type.js";
import { Response } from "@/core/utils/response.util.js";
import type { KickMessage } from "@/core/types/player-kick.type.js";

export type PlayerClient = Client<{ auth: AuthPlayer }> & ClientSend;

/** Close code (4000–4999) gửi về client khi bị đá — client dựa vào đây để hiện thông báo. */
export const KICK_CLOSE_CODES: Record<KickReason, number> = {
    [KickReason.DUPLICATE_LOGIN]: 4001,
    [KickReason.BANNED]: 4002,
    [KickReason.ACCOUNT_DELETED]: 4003,
    [KickReason.SESSION_REVOKED]: 4004,
    [KickReason.PLAYER_UPDATED]: 4005,
    [KickReason.PLAYER_DELETED]: 4006,
};

/**
 * Room yêu cầu player token (trả về lúc login). Client join với `client.auth.token = playerToken`
 * → `client.auth` = `AuthPlayer`.
 *
 * Quản lý kết nối online (room con gọi trong lifecycle của mình):
 * - `registerOnlinePlayer` (cuối `onJoin`): subscribe topic kick của user + đá kết nối cũ của cùng player
 *   ở mọi room/process (đăng nhập trùng).
 * - `unregisterOnlinePlayer` (`onLeave`), `verifyReconnect` (`onReconnect`).
 */
export abstract class BasePlayerRoom<T extends RoomOptions = RoomOptions> extends Room<T> {
    /** Gửi `Success` cho mọi client trong room (envelope `Result`, như `client.sendSuccess`). */
    broadcastSuccess(
        type: string | number,
        data: unknown = null,
        options?: Parameters<Room["broadcast"]>[2]
    ) {
        this.broadcast(type, Response.success(data), options);
    }

    /** Gửi một `Result` dựng sẵn cho mọi client trong room. */
    broadcastResult(
        type: string | number,
        result: Result<unknown>,
        options?: Parameters<Room["broadcast"]>[2]
    ) {
        this.broadcast(type, result, options);
    }

    /** `client.sessionId` → auth — gồm cả client đang rớt mạng chờ reconnect. */
    private readonly onlinePlayers = new Map<string, AuthPlayer>();
    /** Client bị đá lúc đang rớt mạng → chặn khi reconnect. */
    private readonly kickedWhileDropped = new Map<string, KickReason>();
    /** userId → handler đã subscribe (1 subscription / user / room). */
    private readonly kickHandlers = new Map<string, (message: KickMessage) => void>();

    static async onAuth(
        _token: string,
        _options: unknown,
        _context: AuthContext
    ): Promise<AuthPlayer> {
        throw new Error("Room authentication is not configured");
    }

    /** Implemented by the application adapter; core does not know account persistence or policies. */
    protected abstract assertStillPlayable(auth: AuthPlayer): Promise<void>;

    protected async registerOnlinePlayer(
        client: PlayerClient,
        options: { kickDuplicateLogins?: boolean } = {}
    ) {
        const { userId, playerId } = client.auth;
        this.onlinePlayers.set(client.sessionId, client.auth);

        if (!this.kickHandlers.has(userId)) {
            const handler = (message: KickMessage) => this.handleKick(userId, message);
            this.kickHandlers.set(userId, handler);
            await this.presence.subscribe(userKickTopic(userId), handler);
        }

        // Room phụ (party) không được đá: kết nối world của cùng player là hợp lệ.
        if (options.kickDuplicateLogins === false) return;
        // Đá kết nối cũ của cùng player (kể cả trong chính room này), trừ kết nối vừa vào.
        playerKickService.kickUser(userId, KickReason.DUPLICATE_LOGIN, {
            playerId,
            exceptConnection: this.connectionKey(client.sessionId),
        });
    }

    protected async unregisterOnlinePlayer(client: PlayerClient) {
        this.onlinePlayers.delete(client.sessionId);
        this.kickedWhileDropped.delete(client.sessionId);

        const { userId } = client.auth;
        const stillOnline = [...this.onlinePlayers.values()].some((auth) => auth.userId === userId);
        const handler = this.kickHandlers.get(userId);
        if (!stillOnline && handler) {
            this.kickHandlers.delete(userId);
            await this.presence.unsubscribe(userKickTopic(userId), handler);
        }
    }

    /**
     * Gọi đầu `onReconnect`. Reconnect không đi qua `onAuth` → kiểm tra lại: bị đá lúc rớt mạng,
     * session đã thu hồi hoặc player bị ban trong lúc mất kết nối thì đá luôn. Trả `false` nếu đã đá.
     */
    protected async verifyReconnect(client: PlayerClient): Promise<boolean> {
        const kickedReason = this.kickedWhileDropped.get(client.sessionId);
        if (kickedReason) {
            client.leave(KICK_CLOSE_CODES[kickedReason]);
            return false;
        }
        try {
            await this.assertStillPlayable(client.auth);
            return true;
        } catch {
            client.leave(KICK_CLOSE_CODES[KickReason.SESSION_REVOKED]);
            return false;
        }
    }

    /**
     * Room có bị đá bởi `reason` không. Mặc định có; room phụ (party) bỏ qua `DUPLICATE_LOGIN` vì kết nối của nó
     * luôn nằm cạnh một kết nối world của cùng player (world room mới vào lúc đổi map không được đá nó).
     */
    protected shouldKickFor(_reason: KickReason): boolean {
        return true;
    }

    private handleKick(userId: string, message: KickMessage) {
        if (!this.shouldKickFor(message.reason)) return;
        for (const [sessionId, auth] of this.onlinePlayers) {
            if (auth.userId !== userId) continue;
            if (message.playerId && message.playerId !== auth.playerId) continue;
            if (message.userSessionId && message.userSessionId !== auth.userSessionId) continue;
            if (message.exceptConnection === this.connectionKey(sessionId)) continue;

            const client = this.clients.getById(sessionId);
            if (client) client.leave(KICK_CLOSE_CODES[message.reason]);
            else this.kickedWhileDropped.set(sessionId, message.reason);
        }
    }

    private connectionKey(sessionId: string) {
        return `${this.roomId}:${sessionId}`;
    }
}
