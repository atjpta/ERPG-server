import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { ACCOUNT_DELETION_WEB_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { userAuthMiddleware } from "@/modules/auth/middlewares/user.auth.middleware.js";
import { userRenderAccountDeletionPage } from "@/apis/user/auth/services/user.account-deletion-page.service.js";
import { accountDeletionService } from "@/modules/auth/services/account-deletion.service.js";
import {
    UserDeleteMyAccountSchema,
    UserWebAccountDeletionSchema,
} from "@/apis/user/auth/validators/user.account-deletion.validator.js";

const authEndpoint = createEndpoint.create({ use: [userAuthMiddleware] });
const webEndpoint = createEndpoint.create({
    use: [createRateLimitMiddleware(ACCOUNT_DELETION_WEB_RATE_LIMIT)],
});

/** Xoá tài khoản — bắt buộc theo chính sách Google Play (trong app + qua web). */
export const userAccountDeletionController = {
    /** Người chơi tự xoá trong game (Cài đặt → Tài khoản → Xoá) — xử lý ngay, token hết hiệu lực. */
    userAccountDeleteMe: authEndpoint(
        "/auth/account",
        {
            method: "DELETE",
            sdk: {
                summary:
                    "Xoá tài khoản ngay trong game (chính sách Google Play); token hết hiệu lực.",
                auth: "user",
                response: null,
            },
            body: UserDeleteMyAccountSchema.optional(),
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await accountDeletionService.deleteMyAccount(ctx.context.userId, ctx.body?.reason);
                return Response.ok({ message: "Account deleted" });
            })
    ),

    /** Form trên trang web — chỉ ghi nhận, admin xác minh rồi xử lý. */
    userAccountDeletionWebRequest: webEndpoint(
        "/auth/account-deletion-requests",
        {
            method: "POST",
            sdk: {
                summary: "Gửi yêu cầu xoá tài khoản từ form web (admin xác minh sau).",
                auth: "none",
                response: null,
            },
            body: UserWebAccountDeletionSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await accountDeletionService.submitWebRequest(ctx.body);
                return Response.created(ctx, { message: "Request received" });
            })
    ),

    /** Trang HTML — URL `<PUBLIC_URL>/user/account-deletion` khai báo trên Play Console. */
    userAccountDeletionPage: createEndpoint(
        "/account-deletion",
        {
            method: "GET",
            sdk: {
                summary: "Trang HTML xoá tài khoản.",
                auth: "none",
                response: null,
                hidden: true,
            },
        },
        async () => {
            return new globalThis.Response(userRenderAccountDeletionPage(), {
                headers: { "content-type": "text/html; charset=utf-8" },
            });
        }
    ),
};
