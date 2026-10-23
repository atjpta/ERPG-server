export interface UserPlayGamesProfile {
    /** Play Games player ID — định danh chính của người chơi trên Google Play Games. */
    playerId: string;
    displayName: string | null;
    /**
     * Chỉ có khi client xin thêm scope `OPEN_ID` (và `EMAIL`) lúc `RequestServerSideAccess` —
     * dùng để liên kết cùng tài khoản với đăng nhập Google trên PC.
     */
    google: { sub: string; email: string | null } | null;
}
