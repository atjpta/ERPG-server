import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { gameServerService } from "@/modules/auth/user/services/game-server.service.js";

const prefix = "/game-servers";

export const gameServerController = {
    /** Public — màn chọn server trước/sau login. */
    gameServerIndex: createEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const servers = await gameServerService.listVisible();
            return Response.ok({ data: servers });
        })
    ),
};
