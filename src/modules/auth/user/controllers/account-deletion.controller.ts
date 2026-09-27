import { createEndpoint } from "colyseus";
import { createRateLimitMiddleware } from "@/core/middlewares/rate-limit.middleware.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { ACCOUNT_DELETION_WEB_RATE_LIMIT } from "@/modules/auth/constants/rate-limit.constant.js";
import { authMiddleware } from "@/modules/auth/middlewares/auth.middleware.js";
import { renderAccountDeletionPage } from "@/modules/auth/user/pages/account-deletion.page.js";
import { accountDeletionService } from "@/modules/auth/user/services/account-deletion.service.js";
import {
    DeleteMyAccountSchema,
    WebAccountDeletionSchema,
} from "@/modules/auth/user/validators/account-deletion.validator.js";

const authEndpoint = createEndpoint.create({ use: [authMiddleware] });
const webEndpoint = createEndpoint.create({
    use: [createRateLimitMiddleware(ACCOUNT_DELETION_WEB_RATE_LIMIT)],
});

/** Xoá tài khoản — bắt buộc theo chính sách Google Play (trong app + qua web). */
export const accountDeletionController = {
    /** Người chơi tự xoá trong game (Cài đặt → Tài khoản → Xoá) — xử lý ngay, token hết hiệu lực. */
    accountDeleteMe: authEndpoint(
        "/auth/account",
        { method: "DELETE", body: DeleteMyAccountSchema.optional() },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await accountDeletionService.deleteMyAccount(ctx.context.userId, ctx.body?.reason);
                return Response.ok({ message: "🗑️ Account deleted" });
            })
    ),

    /** Form trên trang web — chỉ ghi nhận, admin xác minh rồi xử lý. */
    accountDeletionWebRequest: webEndpoint(
        "/auth/account-deletion-requests",
        { method: "POST", body: WebAccountDeletionSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await accountDeletionService.submitWebRequest(ctx.body);
                return Response.created(ctx, { message: "Request received" });
            })
    ),

    /** Trang HTML — URL `<PUBLIC_URL>/account-deletion` khai báo trên Play Console. */
    accountDeletionPage: createEndpoint("/account-deletion", { method: "GET" }, async () => {
        return new globalThis.Response(renderAccountDeletionPage(), {
            headers: { "content-type": "text/html; charset=utf-8" },
        });
    }),
};
