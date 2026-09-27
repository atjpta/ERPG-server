import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminMasterDataService } from "@/modules/master-data/admin/services/admin.master-data.service.js";
import {
    AdminMasterDataKeyParamSchema,
    AdminUpdateMasterDataSchema,
} from "@/modules/master-data/admin/validators/admin.master-data.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/admin/master-data";

export const adminMasterDataController = {
    adminMasterDataIndex: adminEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const result = await adminMasterDataService.getAll();
            return Response.ok({ data: result });
        })
    ),

    adminMasterDataShow: adminEndpoint(
        `${prefix}/:key`,
        { method: "GET", params: AdminMasterDataKeyParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminMasterDataService.getByKey(
                    AdminMasterDataKeyParamSchema.parse(ctx.params).key
                );
                if (!result) return Response.notFound(ctx);
                return Response.ok({ data: result });
            })
    ),

    adminMasterDataUpdate: adminEndpoint(
        `${prefix}/:key`,
        { method: "PUT", params: AdminMasterDataKeyParamSchema, body: AdminUpdateMasterDataSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await adminMasterDataService.update(
                    AdminMasterDataKeyParamSchema.parse(ctx.params).key,
                    ctx.body
                );
                return Response.ok({ data: result });
            })
    ),
};
