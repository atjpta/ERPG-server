import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { and, eq, ilike } from "drizzle-orm";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";
import { GameServers } from "@/modules/auth/entities/game-server.entity.js";
import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import {
    AdminCreateGameServerSchema,
    AdminListGameServersQuerySchema,
    AdminUpdateGameServerSchema,
} from "@/apis/admin/auth/validators/admin.game-server.validator.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/game-servers";

export const adminGameServerController = {
    adminGameServerIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListGameServersQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { search, status, ...pagination } = ctx.query;
                const where = and(
                    search ? ilike(GameServers.code, `%${search}%`) : undefined,
                    status ? eq(GameServers.status, status) : undefined
                );
                const result = await GameServerRepo.paginate({ pagination, where });
                return HttpResponse.success(result);
            })
    ),

    adminGameServerShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const server = await GameServerRepo.findById({ id: ctx.params.id });
                if (!server) return HttpResponse.notFound(ctx);
                return HttpResponse.success(server);
            })
    ),

    adminGameServerCreate: adminEndpoint(
        prefix,
        { method: "POST", body: AdminCreateGameServerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                if (await GameServerRepo.findByCode({ code: ctx.body.code })) {
                    return HttpResponse.conflict(ctx, AuthErrorCode.GAME_SERVER_CODE_EXISTS);
                }
                const server = await GameServerRepo.create({ data: ctx.body });
                return HttpResponse.created(ctx, server);
            })
    ),

    adminGameServerUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdateGameServerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const server = await GameServerRepo.updateById({
                    id: ctx.params.id,
                    data: ctx.body,
                });
                if (!server) return HttpResponse.notFound(ctx);
                return HttpResponse.success(server);
            })
    ),
};
