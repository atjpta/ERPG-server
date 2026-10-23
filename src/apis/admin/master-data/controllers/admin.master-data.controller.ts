import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import {
    AdminMasterDataKeyParamSchema,
    AdminUpdateMasterDataSchema,
} from "@/apis/admin/master-data/validators/admin.master-data.validator.js";
import { MasterDataRepo } from "@/modules/master-data/repositories/master-data.repository.js";
import { masterDataUpdateService } from "@/modules/master-data/services/master-data-update.service.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/master-data";

export const adminMasterDataController = {
    adminMasterDataIndex: adminEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const result = await MasterDataRepo.findMany();
            return HttpResponse.success(result);
        })
    ),

    adminMasterDataShow: adminEndpoint(
        `${prefix}/:key`,
        { method: "GET", params: AdminMasterDataKeyParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await MasterDataRepo.findByKey({
                    key: AdminMasterDataKeyParamSchema.parse(ctx.params).key,
                });
                if (!result) return HttpResponse.notFound(ctx);
                return HttpResponse.success(result);
            })
    ),

    adminMasterDataUpdate: adminEndpoint(
        `${prefix}/:key`,
        { method: "PUT", params: AdminMasterDataKeyParamSchema, body: AdminUpdateMasterDataSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await masterDataUpdateService.update({
                    key: AdminMasterDataKeyParamSchema.parse(ctx.params).key,
                    ...ctx.body,
                });
                return HttpResponse.from(ctx, result);
            })
    ),
};
