import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { userGameServerService } from "@/apis/user/auth/services/user.game-server.service.js";
import { z } from "zod";
import { UserGameServerResponse } from "@/apis/user/auth/validators/user.auth.response.js";

const prefix = "/game-servers";

export const userGameServerController = {
    /** Public — màn chọn server trước/sau login. */
    userGameServerIndex: createEndpoint(
        prefix,
        {
            method: "GET",
            sdk: {
                summary: "Danh sách game server hiển thị cho người chơi (màn chọn server).",
                auth: "none",
                response: z.array(UserGameServerResponse),
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const servers = await userGameServerService.listVisible();
                return HttpResponse.ok({ data: servers });
            })
    ),
};
