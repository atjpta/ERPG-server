import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { authPlayerMiddleware } from "@/modules/auth/middlewares/auth-player.middleware.js";
import { playerService } from "@/modules/player/user/services/player.service.js";
import { RenamePlayerSchema } from "@/modules/player/user/validators/player.validator.js";

const playerEndpoint = createEndpoint.create({ use: [authPlayerMiddleware] });
const prefix = "/players";

export const playerController = {
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
