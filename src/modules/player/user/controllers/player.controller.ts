import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
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
