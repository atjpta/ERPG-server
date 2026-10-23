export interface UserOauthProfile {
    providerUserId: string;
    email: string | null;
}

export interface UserOauthCredential {
    idToken: string;
    /** Tuỳ chọn — một số plugin Google Sign-In cho Unity không hỗ trợ truyền nonce. */
    nonce?: string;
}
