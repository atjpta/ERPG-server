import { createEndpoint } from "colyseus";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { playerAuthMiddleware } from "@/modules/auth/middlewares/player.auth.middleware.js";
import { userAuthMiddleware } from "@/modules/auth/middlewares/user.auth.middleware.js";
import { userPlayerService } from "@/apis/user/player/services/user.player.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import {
    UserCreatePlayerSchema,
    UserRenamePlayerSchema,
} from "@/apis/user/player/validators/user.player.validator.js";

const userEndpoint = createEndpoint.create({ use: [userAuthMiddleware] });
const playerEndpoint = createEndpoint.create({ use: [playerAuthMiddleware] });
const prefix = "/players";

export const userPlayerController = {
    /** Màn chọn nhân vật (user token): nhân vật của tài khoản + giới hạn số nhân vật / độ dài tên. */
    userPlayerIndex: userEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({
                data: await userPlayerService.listCharacters(ctx.context.userId),
            });
        })
    ),

    /** Tên ngẫu nhiên chưa ai dùng, đúng độ dài master data (user token). */
    userPlayerRandomName: userEndpoint(`${prefix}/random-name`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            return Response.ok({ data: { name: await playerService.randomName() } });
        })
    ),

    /** Chọn nhân vật để vào game (user token) — trả playerToken của nhân vật đó. */
    userPlayerSelect: userEndpoint(
        `${prefix}/:id/select`,
        { method: "POST", params: IdParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { userId, userSessionId } = ctx.context;
                const result = await userPlayerService.selectCharacter({
                    userId,
                    sessionId: userSessionId,
                    playerId: ctx.params.id,
                });
                return Response.ok({ data: result });
            })
    ),

    /** Tạo nhân vật (user token) — trả player + playerToken để join room. */
    userPlayerCreate: userEndpoint(
        prefix,
        { method: "POST", body: UserCreatePlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { userId, userSessionId } = ctx.context;
                const result = await userPlayerService.createCharacter({
                    userId,
                    sessionId: userSessionId,
                    body: ctx.body,
                });
                return Response.created(ctx, { data: result });
            })
    ),

    userPlayerMe: playerEndpoint(`${prefix}/me`, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const player = await playerService.findWithStateById(ctx.context.playerId);
            return Response.ok({ data: player });
        })
    ),

    userPlayerRename: playerEndpoint(
        `${prefix}/me/name`,
        { method: "PUT", body: UserRenamePlayerSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await playerService.rename(ctx.context.playerId, ctx.body.name);
                return Response.ok({ data: player });
            })
    ),
};
