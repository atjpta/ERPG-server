import { createEndpoint } from "colyseus";
import { HttpResponse, RouterContainer } from "@/core/response/http-response.js";
import { GameServerRepo } from "@/modules/auth/repositories/game-server.repository.js";
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
                const visible = await GameServerRepo.findVisible();
                const servers = visible.map(({ id, code, status }) => ({ id, code, status }));
                return HttpResponse.success(servers);
            })
    ),
};
