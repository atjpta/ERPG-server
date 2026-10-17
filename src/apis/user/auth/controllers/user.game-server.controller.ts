import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { userGameServerService } from "@/apis/user/auth/services/user.game-server.service.js";

const prefix = "/game-servers";

export const userGameServerController = {
    /** Public — màn chọn server trước/sau login. */
    userGameServerIndex: createEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const servers = await userGameServerService.listVisible();
            return Response.ok({ data: servers });
        })
    ),
};
