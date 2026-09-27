import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { authPlayerMiddleware } from "@/modules/auth/middlewares/auth-player.middleware.js";
import { playerService } from "@/modules/auth/user/services/player.service.js";
import { RenamePlayerSchema } from "@/modules/auth/user/validators/player.validator.js";

const playerEndpoint = createEndpoint.create({ use: [authPlayerMiddleware] });
const prefix = "/players";

export const playerController = {
    playerMe: playerEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const player = await playerService.findById({ id: ctx.context.playerId });
            if (!player) return Response.notFound(ctx);
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
