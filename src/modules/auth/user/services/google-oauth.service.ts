import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { DateTime } from "luxon";
import { env, googleIdTokenAudiences } from "@/configs/env.config.js";
import { cacheService } from "@/core/cache/cache.service.js";
import { ResponseCode } from "@/core/enums/response-code.enum.js";
import { serviceError } from "@/core/utils/service-error.js";

/** Thời gian sống của nonce — cũng là tuổi tối đa của idToken chấp nhận được. */
const NONCE_TTL_SECONDS = 600;

export interface OauthProfile {
    providerUserId: string;
    email: string | null;
}

export interface OauthCredential {
    idToken: string;
    /** Tuỳ chọn — một số plugin Google Sign-In cho Unity không hỗ trợ truyền nonce. */
    nonce?: string;
}

/**
 * Đăng nhập Android và PC bằng Google idToken; mọi nền tảng liên kết cùng tài khoản qua claim `sub`.
 *
 * Chống replay: client xin nonce ở `POST /auth/oauth/nonce`, gắn nó vào ID token; server kiểm tra khớp
 * và chỉ chấp nhận mỗi nonce một lần. Client cũ không gửi nonce thì ID token chỉ dùng được một lần.
 */
export class GoogleOauthService {
    private readonly client = new OAuth2Client();

    /** Nonce tự ký (`<random>.<hết hạn>.<chữ ký>`) — không tốn bộ nhớ lúc cấp, chỉ nonce đã dùng mới được nhớ. */
    issueNonce(): string {
        const id = randomBytes(16).toString("base64url");
        const expiresAt = Math.floor(DateTime.now().toSeconds()) + NONCE_TTL_SECONDS;
        const body = `${id}.${expiresAt}`;
        return `${body}.${this.signNonce(body)}`;
    }

    async verifyIdToken({ idToken, nonce }: OauthCredential): Promise<OauthProfile> {
        const audiences = googleIdTokenAudiences();
        if (audiences.length === 0) {
            serviceError("Google login is not enabled", 400, ResponseCode.OAUTH_PROVIDER_DISABLED);
        }

        const parsedNonce = nonce ? this.parseNonce(nonce) : null;

        let payload;
        try {
            const ticket = await this.client.verifyIdToken({
                idToken,
                audience: audiences,
            });
            payload = ticket.getPayload();
        } catch {
            serviceError("Invalid Google idToken", 400, ResponseCode.OAUTH_INVALID_CREDENTIAL);
        }
        if (!payload || (nonce && payload.nonce !== nonce)) {
            serviceError("Invalid Google idToken", 400, ResponseCode.OAUTH_INVALID_CREDENTIAL);
        }

        if (parsedNonce) {
            await this.consumeNonce(parsedNonce);
        } else {
            await this.consumeIdToken(idToken, payload.exp);
        }

        // Chỉ tin email khi Google xác nhận đã verify.
        const email = payload.email_verified ? (payload.email ?? null) : null;
        return { providerUserId: payload.sub, email };
    }

    /** Không có nonce → nhớ hash của idToken tới lúc hết hạn để token không bị dùng lại. */
    private async consumeIdToken(idToken: string, exp: number) {
        const hash = createHash("sha256").update(idToken).digest("base64url");
        const ttl = Math.max(Math.ceil(exp - DateTime.now().toSeconds()), 1);
        const fresh = await cacheService.setIfAbsent(`oauth:id-token:${hash}`, true, ttl);
        if (!fresh) {
            serviceError("idToken already used", 400, ResponseCode.OAUTH_INVALID_CREDENTIAL);
        }
    }

    private signNonce(body: string): string {
        return createHmac("sha256", env.JWT_SECRET)
            .update(`oauth-nonce:${body}`)
            .digest("base64url");
    }

    /** Kiểm tra chữ ký + hạn của nonce (chưa đụng tới trạng thái "đã dùng"). */
    private parseNonce(nonce: string): { id: string; expiresAt: number } {
        const [id, expiresAt, signature, ...rest] = nonce.split(".");
        const expected = id && expiresAt ? this.signNonce(`${id}.${expiresAt}`) : "";
        const valid =
            rest.length === 0 &&
            !!signature &&
            signature.length === expected.length &&
            timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
            Number(expiresAt) > DateTime.now().toSeconds();

        if (!valid) serviceError("Invalid nonce", 400, ResponseCode.OAUTH_INVALID_CREDENTIAL);
        return { id, expiresAt: Number(expiresAt) };
    }

    /** Nonce chỉ dùng được 1 lần — nhớ tới lúc hết hạn để chặn replay (atomic). */
    private async consumeNonce({ id, expiresAt }: { id: string; expiresAt: number }) {
        const ttl = Math.max(Math.ceil(expiresAt - DateTime.now().toSeconds()), 1);
        const fresh = await cacheService.setIfAbsent(`oauth:nonce:${id}`, true, ttl);
        if (!fresh) serviceError("Nonce already used", 400, ResponseCode.OAUTH_INVALID_CREDENTIAL);
    }
}

export const googleOauthService = new GoogleOauthService();
