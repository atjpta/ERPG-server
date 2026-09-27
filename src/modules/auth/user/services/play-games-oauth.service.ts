import { OAuth2Client } from "google-auth-library";
import { env } from "@/configs/env.config.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const PLAYERS_ME_ENDPOINT = "https://www.googleapis.com/games/v1/players/me";

export interface PlayGamesProfile {
    /** Play Games player ID — định danh chính của người chơi trên Google Play Games. */
    playerId: string;
    displayName: string | null;
    /**
     * Chỉ có khi client xin thêm scope `OPEN_ID` (và `EMAIL`) lúc `RequestServerSideAccess` —
     * dùng để liên kết cùng tài khoản với đăng nhập Google trên PC.
     */
    google: { sub: string; email: string | null } | null;
}

/**
 * Đăng nhập **Google Play Games Services v2** (plugin Unity `play-games-plugin-for-unity` v2.x):
 * 1. Client: `PlayGamesPlatform.Instance.Authenticate(...)` → `RequestServerSideAccess(false, code => ...)`
 *    (tuỳ chọn thêm scope `OPEN_ID`, `EMAIL` để server nhận được idToken).
 * 2. Server: đổi code bằng Web Client ID + Secret tại `oauth2.googleapis.com/token`
 *    (`redirect_uri` rỗng) → gọi `games/v1/players/me` lấy player ID.
 * Code chỉ dùng được 1 lần (Google tự chặn replay).
 * Tham khảo: https://developer.android.com/games/pgs/android/server-access
 */
export class PlayGamesOauthService {
    private readonly idTokenClient = new OAuth2Client();

    async verifyServerAuthCode(serverAuthCode: string): Promise<PlayGamesProfile> {
        if (!env.GOOGLE_WEB_CLIENT_ID || !env.GOOGLE_WEB_CLIENT_SECRET) {
            serviceError(
                "Play Games login is not enabled",
                400,
                ResponseCode.OAUTH_PROVIDER_DISABLED
            );
        }

        const tokens = await this.exchangeCode(serverAuthCode);
        const player = await this.fetchPlayer(tokens.access_token);
        const google = tokens.id_token ? await this.verifyIdToken(tokens.id_token) : null;

        return { playerId: player.playerId, displayName: player.displayName ?? null, google };
    }

    private async exchangeCode(code: string) {
        const res = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: env.GOOGLE_WEB_CLIENT_ID,
                client_secret: env.GOOGLE_WEB_CLIENT_SECRET,
                grant_type: "authorization_code",
                redirect_uri: "",
            }),
        });
        if (!res.ok) {
            // 400 invalid_grant = code sai/hết hạn/đã dùng.
            serviceError(
                "Invalid Play Games server auth code",
                400,
                ResponseCode.OAUTH_INVALID_CREDENTIAL
            );
        }
        return (await res.json()) as { access_token: string; id_token?: string };
    }

    private async fetchPlayer(accessToken: string) {
        const res = await fetch(PLAYERS_ME_ENDPOINT, {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
            serviceError("Cannot fetch Play Games player", 502, ResponseCode.OAUTH_PROVIDER_ERROR);
        }
        const player = (await res.json()) as { playerId?: string; displayName?: string };
        if (!player.playerId) {
            serviceError("Cannot fetch Play Games player", 502, ResponseCode.OAUTH_PROVIDER_ERROR);
        }
        return player as { playerId: string; displayName?: string };
    }

    private async verifyIdToken(idToken: string) {
        try {
            const ticket = await this.idTokenClient.verifyIdToken({
                idToken,
                audience: env.GOOGLE_WEB_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            if (!payload) return null;
            return {
                sub: payload.sub,
                email: payload.email_verified ? (payload.email ?? null) : null,
            };
        } catch {
            serviceError("Invalid Google idToken", 400, ResponseCode.OAUTH_INVALID_CREDENTIAL);
        }
    }
}

export const playGamesOauthService = new PlayGamesOauthService();
