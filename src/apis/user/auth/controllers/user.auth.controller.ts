import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
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

const authEndpoint = createEndpoint.create({ use: [userAuthMiddleware] });
/** Endpoint public đăng ký/đăng nhập — giới hạn theo IP. */
const publicAuthEndpoint = createEndpoint.create({
    use: [createRateLimitMiddleware(AUTH_IP_RATE_LIMIT)],
});
const prefix = "/auth";

export const userAuthController = {
    userAuthRegister: publicAuthEndpoint(
        `${prefix}/register`,
        { method: "POST", body: UserRegisterSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.register(ctx.body);
                return Response.created(ctx, { data: result });
            })
    ),

    userAuthLogin: publicAuthEndpoint(
        `${prefix}/login`,
        { method: "POST", body: UserLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.login(ctx.body);
                return Response.ok({ data: result });
            })
    ),

    /** Login khách — server tự tạo user + player theo IP client. */
    userAuthGuestLogin: publicAuthEndpoint(
        `${prefix}/guest/login`,
        { method: "POST", body: UserGuestLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.loginAsGuest(ctx.body, ctx.context.clientIp);
                return Response.ok({ data: result });
            })
    ),

    /** Cấp nonce dùng 1 lần (10 phút) — client đưa cho Google lúc xin idToken. */
    userAuthOauthNonce: publicAuthEndpoint(`${prefix}/oauth/nonce`, { method: "POST" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: { nonce: userAuthService.issueOauthNonce() } });
        })
    ),

    /** Login/đăng ký Android và PC bằng Google idToken đã được xác minh. */
    userAuthGoogleLogin: publicAuthEndpoint(
        `${prefix}/oauth/google/login`,
        { method: "POST", body: UserGoogleLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.loginWithGoogle(ctx.body);
                return Response.ok({ data: result });
            })
    ),

    /** Tương thích ngược cho client Play Games cũ dùng `serverAuthCode`. */
    userAuthPlayGamesLogin: publicAuthEndpoint(
        `${prefix}/oauth/play-games/login`,
        { method: "POST", body: UserPlayGamesLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await userAuthService.loginWithPlayGames(ctx.body);
                return Response.ok({ data: result });
            })
    ),

    userAuthMe: authEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const profile = await userAuthService.getProfile(ctx.context.userId);
            if (!profile) return Response.notFound(ctx);
            return Response.ok({ data: profile });
        })
    ),

    userAuthLogout: authEndpoint(`${prefix}/logout`, { method: "POST" }, (ctx) =>
        RouterContainer(ctx, async () => {
            await userAuthService.logout(ctx.context.userId, ctx.context.userSessionId);
            return Response.ok({ message: "🔒 Logged out" });
        })
    ),

    userAuthLogoutAll: authEndpoint(`${prefix}/logout-all`, { method: "POST" }, (ctx) =>
        RouterContainer(ctx, async () => {
            await userAuthService.logoutAll(ctx.context.userId);
            return Response.ok({ message: "🔒 Logged out from all devices" });
        })
    ),

    userAuthSessions: authEndpoint(`${prefix}/sessions`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const sessions = await userAuthService.listSessions(ctx.context.userId);
            return Response.ok({ data: sessions });
        })
    ),

    userAuthRevokeSession: authEndpoint(
        `${prefix}/sessions/:id/revoke`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await userAuthService.revokeSession({
                    userId: ctx.context.userId,
                    sessionId: ctx.params.id,
                });
                return Response.ok({ message: "🔒 Session revoked" });
            })
    ),
};
