import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { AUTH_IP_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { authMiddleware } from "@/modules/auth/middlewares/auth.middleware.js";
import { authService } from "@/modules/auth/user/services/auth.service.js";
import {
    GoogleLoginSchema,
    GuestLoginSchema,
    LoginSchema,
    PlayGamesLoginSchema,
    RegisterSchema,
} from "@/modules/auth/user/validators/auth.validator.js";

const authEndpoint = createEndpoint.create({ use: [authMiddleware] });
/** Endpoint public đăng ký/đăng nhập — giới hạn theo IP. */
const publicAuthEndpoint = createEndpoint.create({
    use: [createRateLimitMiddleware(AUTH_IP_RATE_LIMIT)],
});
const prefix = "/auth";

export const authController = {
    authRegister: publicAuthEndpoint(
        `${prefix}/register`,
        { method: "POST", body: RegisterSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await authService.register(ctx.body);
                return Response.created(ctx, { data: result });
            })
    ),

    authLogin: publicAuthEndpoint(`${prefix}/login`, { method: "POST", body: LoginSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const result = await authService.login(ctx.body);
            return Response.ok({ data: result });
        })
    ),

    /** Login khách — server tự tạo user + player theo IP client. */
    authGuestLogin: publicAuthEndpoint(
        `${prefix}/guest/login`,
        { method: "POST", body: GuestLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await authService.loginAsGuest(ctx.body, ctx.context.clientIp);
                return Response.ok({ data: result });
            })
    ),

    /** Cấp nonce dùng 1 lần (10 phút) — client đưa cho Google lúc xin idToken. */
    authOauthNonce: publicAuthEndpoint(`${prefix}/oauth/nonce`, { method: "POST" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: { nonce: authService.issueOauthNonce() } });
        })
    ),

    /** Login/đăng ký Android và PC bằng Google idToken đã được xác minh. */
    authGoogleLogin: publicAuthEndpoint(
        `${prefix}/oauth/google/login`,
        { method: "POST", body: GoogleLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await authService.loginWithGoogle(ctx.body);
                return Response.ok({ data: result });
            })
    ),

    /** Tương thích ngược cho client Play Games cũ dùng `serverAuthCode`. */
    authPlayGamesLogin: publicAuthEndpoint(
        `${prefix}/oauth/play-games/login`,
        { method: "POST", body: PlayGamesLoginSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await authService.loginWithPlayGames(ctx.body);
                return Response.ok({ data: result });
            })
    ),

    authMe: authEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const profile = await authService.getProfile(ctx.context.userId);
            if (!profile) return Response.notFound(ctx);
            return Response.ok({ data: profile });
        })
    ),

    authLogout: authEndpoint(`${prefix}/logout`, { method: "POST" }, (ctx) =>
        RouterContainer(ctx, async () => {
            await authService.logout(ctx.context.userId, ctx.context.userSessionId);
            return Response.ok({ message: "🔒 Logged out" });
        })
    ),

    authLogoutAll: authEndpoint(`${prefix}/logout-all`, { method: "POST" }, (ctx) =>
        RouterContainer(ctx, async () => {
            await authService.logoutAll(ctx.context.userId);
            return Response.ok({ message: "🔒 Logged out from all devices" });
        })
    ),

    authSessions: authEndpoint(`${prefix}/sessions`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const sessions = await authService.listSessions(ctx.context.userId);
            return Response.ok({ data: sessions });
        })
    ),

    authRevokeSession: authEndpoint(
        `${prefix}/sessions/:id/revoke`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await authService.revokeSession({
                    userId: ctx.context.userId,
                    sessionId: ctx.params.id,
                });
                return Response.ok({ message: "🔒 Session revoked" });
            })
    ),
};
