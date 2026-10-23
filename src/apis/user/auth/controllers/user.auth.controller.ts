import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { AUTH_IP_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { userAuthMiddleware } from "@/modules/auth/middlewares/user.auth.middleware.js";
import { userAuthService } from "@/apis/user/auth/services/user.auth.service.js";
import {
    UserGoogleLoginSchema,
    UserGuestLoginSchema,
    UserLoginSchema,
    UserPlayGamesLoginSchema,
    UserRegisterSchema,
} from "@/apis/user/auth/validators/user.auth.validator.js";
import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import { MasterDataErrorCode } from "@/modules/master-data/enums/master-data-error-code.enum.js";
import {
    UserAuthResultResponse,
    UserOauthNonceResponse,
    UserProfileResponse,
    UserSessionResponse,
} from "@/apis/user/auth/validators/user.auth.response.js";
import { z } from "zod";

const authEndpoint = createEndpoint.create({ use: [userAuthMiddleware] });
/** Endpoint public đăng ký/đăng nhập — giới hạn theo IP. */
const publicAuthEndpoint = createEndpoint.create({
    use: [createRateLimitMiddleware(AUTH_IP_RATE_LIMIT)],
});
const prefix = "/auth";

export const userAuthController = {
    userAuthRegister: publicAuthEndpoint(
        `${prefix}/register`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng ký tài khoản email + mật khẩu và đăng nhập luôn.",
                auth: "none",
                response: UserAuthResultResponse,
                errors: [
                    AuthErrorCode.AUTH_EMAIL_EXISTS,
                    MasterDataErrorCode.CLIENT_OUTDATED,
                    MasterDataErrorCode.CLIENT_PLATFORM_DISABLED,
                ],
            },
            body: UserRegisterSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.register(ctx.body);
                return HttpResponse.created(ctx, { data: result });
            })
    ),

    userAuthLogin: publicAuthEndpoint(
        `${prefix}/login`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng nhập email + mật khẩu.",
                auth: "none",
                response: UserAuthResultResponse,
                errors: [
                    AuthErrorCode.AUTH_INVALID_CREDENTIALS,
                    AuthErrorCode.AUTH_ACCOUNT_BANNED,
                    AuthErrorCode.AUTH_ACCOUNT_INACTIVE,
                    AuthErrorCode.AUTH_ACCOUNT_DELETED,
                    MasterDataErrorCode.CLIENT_OUTDATED,
                    MasterDataErrorCode.CLIENT_PLATFORM_DISABLED,
                ],
            },
            body: UserLoginSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.login(ctx.body);
                return HttpResponse.ok({ data: result });
            })
    ),

    /** Login khách — server tự tạo user + player theo IP client. */
    userAuthGuestLogin: publicAuthEndpoint(
        `${prefix}/guest/login`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng nhập khách (tài khoản tạm theo IP).",
                auth: "none",
                response: UserAuthResultResponse,
                errors: [
                    AuthErrorCode.AUTH_ACCOUNT_BANNED,
                    AuthErrorCode.AUTH_ACCOUNT_INACTIVE,
                    AuthErrorCode.AUTH_ACCOUNT_DELETED,
                    MasterDataErrorCode.CLIENT_OUTDATED,
                    MasterDataErrorCode.CLIENT_PLATFORM_DISABLED,
                ],
            },
            body: UserGuestLoginSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.loginAsGuest(ctx.body, ctx.context.clientIp);
                return HttpResponse.ok({ data: result });
            })
    ),

    /** Cấp nonce dùng 1 lần (10 phút) — client đưa cho Google lúc xin idToken. */
    userAuthOauthNonce: publicAuthEndpoint(
        `${prefix}/oauth/nonce`,
        {
            method: "POST",
            sdk: {
                summary:
                    "Xin nonce dùng một lần (10 phút) để gắn vào Google idToken trước khi login.",
                auth: "none",
                response: UserOauthNonceResponse,
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.ok({ data: { nonce: userAuthService.issueOauthNonce() } });
            })
    ),

    /** Login/đăng ký Android và PC bằng Google idToken đã được xác minh. */
    userAuthGoogleLogin: publicAuthEndpoint(
        `${prefix}/oauth/google/login`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng nhập Google (Android và PC) bằng idToken đã xác minh.",
                auth: "none",
                response: UserAuthResultResponse,
                errors: [
                    AuthErrorCode.OAUTH_PROVIDER_DISABLED,
                    AuthErrorCode.OAUTH_INVALID_CREDENTIAL,
                    AuthErrorCode.OAUTH_PROVIDER_ERROR,
                    AuthErrorCode.AUTH_EMAIL_EXISTS,
                    AuthErrorCode.AUTH_ACCOUNT_BANNED,
                    AuthErrorCode.AUTH_ACCOUNT_INACTIVE,
                    AuthErrorCode.AUTH_ACCOUNT_DELETED,
                    MasterDataErrorCode.CLIENT_OUTDATED,
                    MasterDataErrorCode.CLIENT_PLATFORM_DISABLED,
                ],
            },
            body: UserGoogleLoginSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.loginWithGoogle(ctx.body);
                return HttpResponse.ok({ data: result });
            })
    ),

    /** Tương thích ngược cho client Play Games cũ dùng `serverAuthCode`. */
    userAuthPlayGamesLogin: publicAuthEndpoint(
        `${prefix}/oauth/play-games/login`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng nhập Google Play Games (client cũ dùng `serverAuthCode`).",
                auth: "none",
                response: UserAuthResultResponse,
                errors: [
                    AuthErrorCode.OAUTH_PROVIDER_DISABLED,
                    AuthErrorCode.OAUTH_INVALID_CREDENTIAL,
                    AuthErrorCode.OAUTH_PROVIDER_ERROR,
                    AuthErrorCode.AUTH_EMAIL_EXISTS,
                    AuthErrorCode.AUTH_ACCOUNT_BANNED,
                    AuthErrorCode.AUTH_ACCOUNT_INACTIVE,
                    AuthErrorCode.AUTH_ACCOUNT_DELETED,
                    MasterDataErrorCode.CLIENT_OUTDATED,
                    MasterDataErrorCode.CLIENT_PLATFORM_DISABLED,
                ],
            },
            body: UserPlayGamesLoginSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.loginWithPlayGames(ctx.body);
                return HttpResponse.ok({ data: result });
            })
    ),

    userAuthMe: authEndpoint(
        `${prefix}/me`,
        {
            method: "GET",
            sdk: {
                summary: "Thông tin tài khoản hiện tại; dùng để kiểm tra phiên còn hợp lệ.",
                auth: "user",
                response: UserProfileResponse,
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const profile = await userAuthService.getProfile(ctx.context.userId);
                if (!profile) return HttpResponse.notFound(ctx);
                return HttpResponse.ok({ data: profile });
            })
    ),

    userAuthLogout: authEndpoint(
        `${prefix}/logout`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng xuất thiết bị hiện tại (đá kết nối room của phiên này).",
                auth: "user",
                response: null,
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await userAuthService.logout(ctx.context.userId, ctx.context.userSessionId);
                return HttpResponse.ok({ message: "Logged out" });
            })
    ),

    userAuthLogoutAll: authEndpoint(
        `${prefix}/logout-all`,
        {
            method: "POST",
            sdk: { summary: "Đăng xuất mọi thiết bị.", auth: "user", response: null },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await userAuthService.logoutAll(ctx.context.userId);
                return HttpResponse.ok({ message: "Logged out from all devices" });
            })
    ),

    userAuthSessions: authEndpoint(
        `${prefix}/sessions`,
        {
            method: "GET",
            sdk: {
                summary: "Danh sách phiên đăng nhập còn hiệu lực.",
                auth: "user",
                response: z.array(UserSessionResponse),
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const sessions = await userAuthService.listSessions(ctx.context.userId);
                return HttpResponse.ok({ data: sessions });
            })
    ),

    userAuthRevokeSession: authEndpoint(
        `${prefix}/sessions/:id/revoke`,
        {
            method: "POST",
            sdk: {
                summary: "Đăng xuất đúng một thiết bị theo id phiên.",
                auth: "user",
                response: null,
                errors: [AuthErrorCode.AUTH_SESSION_NOT_FOUND],
            },
            params: IdParamSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await userAuthService.revokeSession({
                    userId: ctx.context.userId,
                    sessionId: ctx.params.id,
                });
                return HttpResponse.ok({ message: "Session revoked" });
            })
    ),
};
