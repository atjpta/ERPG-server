export enum OauthProvider {
    /** Tài khoản Google — `providerUserId` = `sub` của idToken (dùng chung Android/PC). */
    GOOGLE = "google",
    /** Google Play Games Services v2 — `providerUserId` = Play Games player ID. */
    PLAY_GAMES = "play_games",
    /** Khách — `providerUserId` = hash của IP client (không lưu IP thô). */
    GUEST = "guest",
}
