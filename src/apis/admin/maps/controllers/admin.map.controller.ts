import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { and, eq, ilike, or } from "drizzle-orm";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { GameMaps } from "@/modules/maps/entities/game-map.entity.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import {
    AdminCreateMapSchema,
    AdminListMapsQuerySchema,
    AdminUpdateMapSchema,
} from "@/apis/admin/maps/validators/admin.map.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/maps";

export const adminMapController = {
    adminMapIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListMapsQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { search, type, status, ...pagination } = ctx.query;
                const where = and(
                    search
                        ? or(
                              ilike(GameMaps.code, `%${search}%`),
                              ilike(GameMaps.name, `%${search}%`)
                          )
                        : undefined,
                    type ? eq(GameMaps.type, type) : undefined,
                    status ? eq(GameMaps.status, status) : undefined
                );
                const result = await GameMapRepo.paginate({ pagination, where });
                return HttpResponse.success(result);
            })
    ),

    adminMapShow: adminEndpoint(`${prefix}/:id`, { method: "GET", params: IdParamSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const map = await GameMapRepo.findById({ id: ctx.params.id });
            if (!map) return HttpResponse.notFound(ctx);
            return HttpResponse.success(map);
        })
    ),

    adminMapCreate: adminEndpoint(prefix, { method: "POST", body: AdminCreateMapSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            if (await GameMapRepo.findByCode({ code: ctx.body.code })) {
                return HttpResponse.conflict(ctx, MapErrorCode.MAP_CODE_EXISTS);
            }
            const map = await GameMapRepo.create({ data: ctx.body });
            return HttpResponse.created(ctx, map);
        })
    ),

    adminMapUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateMapSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const map = await GameMapRepo.updateById({ id: ctx.params.id, data: ctx.body });
                if (!map) return HttpResponse.notFound(ctx);
                return HttpResponse.success(map);
            })
    ),
};
