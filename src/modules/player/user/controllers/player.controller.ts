import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { authPlayerMiddleware } from "@/modules/auth/middlewares/auth-player.middleware.js";
import { authMiddleware } from "@/modules/auth/middlewares/auth.middleware.js";
import { playerAuthService } from "@/modules/auth/user/services/player-auth.service.js";
import { playerService } from "@/modules/player/user/services/player.service.js";
import {
    CreatePlayerSchema,
    RenamePlayerSchema,
} from "@/modules/player/user/validators/player.validator.js";

const userEndpoint = createEndpoint.create({ use: [authMiddleware] });
const playerEndpoint = createEndpoint.create({ use: [authPlayerMiddleware] });
const prefix = "/players";

export const playerController = {
    /** Màn chọn nhân vật (user token): nhân vật của tài khoản + giới hạn số nhân vật / độ dài tên. */
    playerIndex: userEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const [players, limits] = await Promise.all([
                playerService.listCharacters(ctx.context.userId),
                playerService.getCharacterLimits(),
            ]);
            return Response.ok({ data: { players, ...limits } });
        })
    ),

    /** Tên ngẫu nhiên chưa ai dùng, đúng độ dài master data (user token). */
    playerRandomName: userEndpoint(`${prefix}/random-name`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: { name: await playerService.randomName() } });
        })
    ),

    /** Chọn nhân vật để vào game (user token) — trả playerToken của nhân vật đó. */
    playerSelect: userEndpoint(
        `${prefix}/:id/select`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { userId, userSessionId } = ctx.context;
                const player = await playerService.getOwnedOrFail(userId, ctx.params.id);
                const playerToken = await playerAuthService.issueToken({
                    userId,
                    sessionId: userSessionId,
                    playerId: player.id,
                });
                return Response.ok({ data: { player: { id: player.id }, playerToken } });
            })
    ),

    /** Tạo nhân vật (user token) — trả player + playerToken để join room. */
    playerCreate: userEndpoint(prefix, { method: "POST", body: CreatePlayerSchema }, (ctx) =>
        RouterContainer(ctx, async () => {
            const { userId, userSessionId } = ctx.context;
            const player = await playerService.createCharacter({ userId, ...ctx.body });
            const playerToken = await playerAuthService.issueToken({
                userId,
                sessionId: userSessionId,
                playerId: player.id,
            });
            return Response.created(ctx, { data: { player, playerToken } });
        })
    ),

    playerMe: playerEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const player = await playerService.findWithStateById(ctx.context.playerId);
            return Response.ok({ data: player });
        })
    ),

    playerRename: playerEndpoint(
        `${prefix}/me/name`,
        { method: "PUT", body: RenamePlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await playerService.rename(ctx.context.playerId, ctx.body.name);
                return Response.ok({ data: player });
            })
    ),
};
