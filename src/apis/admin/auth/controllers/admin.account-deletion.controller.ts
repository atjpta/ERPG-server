import { createEndpoint } from "colyseus";
import { and, eq, ilike, or } from "drizzle-orm";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import {
    AdminCompleteAccountDeletionSchema,
    AdminListAccountDeletionQuerySchema,
    AdminRejectAccountDeletionSchema,
} from "@/apis/admin/auth/validators/admin.account-deletion.validator.js";
import { AccountDeletionRequests } from "@/modules/auth/entities/account-deletion-request.entity.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { AccountDeletionRequestRepo } from "@/modules/auth/repositories/account-deletion-request.repository.js";
import { accountDeletionService } from "@/modules/auth/services/account-deletion.service.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/account-deletion-requests";

export const adminAccountDeletionController = {
    adminAccountDeletionIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListAccountDeletionQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { search, status, source, page, limit } = ctx.query;
                const where = and(
                    search
                        ? or(
                              ilike(AccountDeletionRequests.contactEmail, `%${search}%`),
                              ilike(AccountDeletionRequests.playerName, `%${search}%`)
                          )
                        : undefined,
                    status ? eq(AccountDeletionRequests.status, status) : undefined,
                    source ? eq(AccountDeletionRequests.source, source) : undefined
                );
                const result = await AccountDeletionRequestRepo.paginate({
                    pagination: { page, limit },
                    where,
                });
                return HttpResponse.success(result);
            })
    ),

    /** Admin đã xác minh người gửi là chủ tài khoản → xoá dữ liệu và đóng yêu cầu. */
    adminAccountDeletionComplete: adminEndpoint(
        `${prefix}/:id/complete`,
        { method: "POST", params: IdParamSchema, body: AdminCompleteAccountDeletionSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await accountDeletionService.completeRequest({
                    id: ctx.params.id,
                    adminId: ctx.context.adminId,
                    ...ctx.body,
                });
                return HttpResponse.from(ctx, result);
            })
    ),

    /** Không xác minh được chủ tài khoản (vd thông tin không khớp). */
    adminAccountDeletionReject: adminEndpoint(
        `${prefix}/:id/reject`,
        { method: "POST", params: IdParamSchema, body: AdminRejectAccountDeletionSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await accountDeletionService.rejectRequest({
                    id: ctx.params.id,
                    adminId: ctx.context.adminId,
                    note: ctx.body.note,
                });
                return HttpResponse.from(ctx, result);
            })
    ),
};
