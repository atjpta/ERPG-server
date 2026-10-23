import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { adminMasterDataService } from "@/apis/admin/master-data/services/admin.master-data.service.js";
import {
    AdminMasterDataKeyParamSchema,
    AdminUpdateMasterDataSchema,
} from "@/apis/admin/master-data/validators/admin.master-data.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/master-data";

export const adminMasterDataController = {
    adminMasterDataIndex: adminEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const result = await adminMasterDataService.getAll();
            return HttpResponse.ok({ data: result });
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
                if (!result) return HttpResponse.notFound(ctx);
                return HttpResponse.ok({ data: result });
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
                return HttpResponse.ok({ data: result });
            })
    ),
};
