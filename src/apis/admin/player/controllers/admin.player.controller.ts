import { createEndpoint } from "colyseus";
import { and, eq, ilike } from "drizzle-orm";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import {
    AdminBanPlayerSchema,
    AdminListPlayersQuerySchema,
    AdminUpdatePlayerSchema,
} from "@/apis/admin/player/validators/admin.player.validator.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { PlayerStatus } from "@/modules/auth/enums/player-status.enum.js";
import { adminAuthMiddleware } from "@/modules/auth/middlewares/admin.auth.middleware.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { playerModerationService } from "@/modules/player/services/player-moderation.service.js";
import { playerService } from "@/modules/player/services/player.service.js";

const adminEndpoint = createEndpoint.create({ use: [adminAuthMiddleware] });
const prefix = "/players";

export const adminPlayerController = {
    adminPlayerIndex: adminEndpoint(
        prefix,
        { method: "GET", query: AdminListPlayersQuerySchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { search, serverId, userId, status, page, limit } = ctx.query;
                const where = and(
                    search ? ilike(Players.name, `%${search}%`) : undefined,
                    serverId ? eq(Players.serverId, serverId) : undefined,
                    userId ? eq(Players.userId, userId) : undefined,
                    status ? eq(Players.status, status) : undefined
                );
                const result = await PlayerIdentityRepo.paginate({
                    pagination: { page, limit },
                    where,
                });
                const states = await PlayerStateRepo.findByPlayerIds(
                    result.items.map((player) => player.id)
                );
                const stateByPlayerId = new Map(states.map((state) => [state.playerId, state]));
                const items = result.items.map((player) => {
                    const state = stateByPlayerId.get(player.id);
                    return state
                        ? {
                              ...player,
                              level: state.level,
                              exp: state.exp,
                              mapCode: state.mapCode,
                              x: state.x,
                              y: state.y,
                              direction: state.direction,
                              hp: state.hp,
                              mp: state.mp,
                          }
                        : player;
                });
                return HttpResponse.success({ ...result, items });
            })
    ),

    adminPlayerShow: adminEndpoint(
        `${prefix}/:id`,
        { method: "GET", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { id } = ctx.params;
                const player = (await PlayerIdentityRepo.findById({ id }))
                    ? await playerService.findWithStateById(id)
                    : null;
                return HttpResponse.success(player);
            })
    ),

    /** GM chỉnh player (level/exp/vị trí — vd kéo player bị kẹt map về làng). */
    adminPlayerUpdate: adminEndpoint(
        `${prefix}/:id`,
        { method: "PUT", params: IdParamSchema, body: AdminUpdatePlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await playerModerationService.update(ctx.params.id, ctx.body);
                return HttpResponse.from(ctx, result);
            })
    ),

    adminPlayerBan: adminEndpoint(
        `${prefix}/:id/ban`,
        { method: "POST", params: IdParamSchema, body: AdminBanPlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.from(
                    ctx,
                    await playerModerationService.ban(ctx.params.id, ctx.body.reason)
                );
            })
    ),

    adminPlayerUnban: adminEndpoint(
        `${prefix}/:id/unban`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await PlayerIdentityRepo.updateById({
                    id: ctx.params.id,
                    data: { status: PlayerStatus.ACTIVE, banReason: null },
                });
                if (!player) return HttpResponse.notFound(ctx);
                return HttpResponse.success(await playerService.findWithStateById(ctx.params.id));
            })
    ),
};
