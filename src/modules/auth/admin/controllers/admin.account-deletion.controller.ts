import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAccountDeletionService } from "@/modules/auth/admin/services/admin.account-deletion.service.js";
import {
    AdminCompleteAccountDeletionSchema,
    AdminListAccountDeletionQuerySchema,
    AdminRejectAccountDeletionSchema,
} from "@/modules/auth/admin/validators/admin.account-deletion.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/account-deletion-requests";

export const adminAccountDeletionController = {
    adminAccountDeletionIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListAccountDeletionQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminAccountDeletionService.list(ctx.query);
                return Response.ok({ data: result });
            })
    ),

    adminAccountDeletionComplete: adminEndpoint(
        `${prefix}/:id/complete`,
        { method: "POST", params: IdParamSchema, body: AdminCompleteAccountDeletionSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminAccountDeletionService.complete(
                    ctx.params.id,
                    ctx.context.adminId,
                    ctx.body
                );
                return Response.ok({ data: result });
            })
    ),

    adminAccountDeletionReject: adminEndpoint(
        `${prefix}/:id/reject`,
        { method: "POST", params: IdParamSchema, body: AdminRejectAccountDeletionSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminAccountDeletionService.reject(
                    ctx.params.id,
                    ctx.context.adminId,
                    ctx.body
                );
                return Response.ok({ data: result });
            })
    ),
};
