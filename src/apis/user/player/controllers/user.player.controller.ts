import { createEndpoint } from "colyseus";
import { Response } from "@/core/response/response.js";
import { HttpResponse, HttpStatusCode, RouterContainer } from "@/core/response/http-response.js";
import { IdParamSchema } from "@/core/validators/id.validator.js";
import { playerAuthMiddleware } from "@/modules/auth/middlewares/player.auth.middleware.js";
import { userAuthMiddleware } from "@/modules/auth/middlewares/user.auth.middleware.js";
import { characterService } from "@/modules/player/services/character.service.js";
import { playerService } from "@/modules/player/services/player.service.js";
import {
    UserCreatePlayerSchema,
    UserRenamePlayerSchema,
} from "@/apis/user/player/validators/user.player.validator.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { AuthErrorCode } from "@/modules/auth/enums/auth-error-code.enum.js";
import {
    UserCharacterListResponse,
    UserPlayerMeResponse,
    UserPlayerTokenResponse,
    UserRandomNameResponse,
} from "@/apis/user/player/validators/user.player.response.js";

const userEndpoint = createEndpoint.create({ use: [userAuthMiddleware] });
const playerEndpoint = createEndpoint.create({ use: [playerAuthMiddleware] });
const prefix = "/players";

export const userPlayerController = {
    /** Màn chọn nhân vật (user token): nhân vật của tài khoản + giới hạn số nhân vật / độ dài tên. */
    userPlayerIndex: userEndpoint(
        prefix,
        {
            method: "GET",
            sdk: {
                summary: "Màn chọn nhân vật: nhân vật của tài khoản và giới hạn tạo nhân vật.",
                auth: "user",
                response: UserCharacterListResponse,
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.success(
                    await characterService.listCharacters(ctx.context.userId)
                );
            })
    ),

    /** Tên ngẫu nhiên chưa ai dùng, đúng độ dài master data (user token). */
    userPlayerRandomName: userEndpoint(
        `${prefix}/random-name`,
        {
            method: "GET",
            sdk: {
                summary: "Tên ngẫu nhiên chưa ai dùng, đúng độ dài theo master data.",
                auth: "user",
                response: UserRandomNameResponse,
                errors: [PlayerErrorCode.PLAYER_NAME_EXISTS, AuthErrorCode.GAME_SERVER_UNAVAILABLE],
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                return HttpResponse.from(
                    ctx,
                    Response.map(await playerService.randomName(), (name) => ({ name }))
                );
            })
    ),

    /** Chọn nhân vật để vào game (user token) — trả playerToken của nhân vật đó. */
    userPlayerSelect: userEndpoint(
        `${prefix}/:id/select`,
        {
            method: "POST",
            sdk: {
                summary: "Chọn nhân vật để vào game; trả `playerToken` dùng để join room.",
                auth: "user",
                response: UserPlayerTokenResponse,
                errors: [PlayerErrorCode.PLAYER_NOT_FOUND, PlayerErrorCode.PLAYER_BANNED],
            },
            params: IdParamSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { userId, userSessionId } = ctx.context;
                const result = await characterService.selectCharacter({
                    userId,
                    sessionId: userSessionId,
                    playerId: ctx.params.id,
                });
                return HttpResponse.success(result);
            })
    ),

    /** Tạo nhân vật (user token) — trả player + playerToken để join room. */
    userPlayerCreate: userEndpoint(
        prefix,
        {
            method: "POST",
            sdk: {
                summary: "Tạo nhân vật mới (tên + class khởi đầu); trả `playerToken` để join room.",
                auth: "user",
                response: UserPlayerTokenResponse,
                errors: [
                    PlayerErrorCode.CLASS_NOT_AVAILABLE,
                    PlayerErrorCode.PLAYER_NAME_INVALID,
                    PlayerErrorCode.PLAYER_NAME_EXISTS,
                    PlayerErrorCode.PLAYER_LIMIT_REACHED,
                    AuthErrorCode.GAME_SERVER_UNAVAILABLE,
                ],
            },
            body: UserCreatePlayerSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const { userId, userSessionId } = ctx.context;
                return HttpResponse.from(
                    ctx,
                    await characterService.createCharacter({
                        userId,
                        sessionId: userSessionId,
                        body: ctx.body,
                    }),
                    HttpStatusCode.CREATED
                );
            })
    ),

    /** Xoá mềm nhân vật (user token): ẩn khỏi danh sách, nhả slot và tên; đá nhân vật nếu đang online. */
    userPlayerDelete: userEndpoint(
        `${prefix}/:id`,
        {
            method: "DELETE",
            sdk: {
                summary:
                    "Xoá mềm nhân vật: ẩn khỏi danh sách, trả lại slot và tên. Nhân vật đang online bị đá ra.",
                auth: "user",
                response: null,
                errors: [PlayerErrorCode.PLAYER_NOT_FOUND, PlayerErrorCode.PLAYER_BANNED],
            },
            params: IdParamSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                await characterService.deleteCharacter({
                    userId: ctx.context.userId,
                    playerId: ctx.params.id,
                });
                return HttpResponse.success();
            })
    ),

    userPlayerMe: playerEndpoint(
        `${prefix}/me`,
        {
            method: "GET",
            sdk: {
                summary: "Thông tin nhân vật đang chọn (dùng player token).",
                auth: "player",
                response: UserPlayerMeResponse,
                errors: [PlayerErrorCode.PLAYER_NOT_FOUND, PlayerErrorCode.PLAYER_BANNED],
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const player = await playerService.findWithStateById(ctx.context.playerId);
                return HttpResponse.success(player);
            })
    ),

    userPlayerRename: playerEndpoint(
        `${prefix}/me/name`,
        {
            method: "PUT",
            sdk: {
                summary: "Đổi tên nhân vật đang chọn (dùng player token).",
                auth: "player",
                response: UserPlayerMeResponse,
                errors: [
                    PlayerErrorCode.PLAYER_NAME_INVALID,
                    PlayerErrorCode.PLAYER_NAME_EXISTS,
                    PlayerErrorCode.PLAYER_NOT_FOUND,
                ],
            },
            body: UserRenamePlayerSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const result = await characterService.renameCharacter({
                    playerId: ctx.context.playerId,
                    name: ctx.body.name,
                });
                return HttpResponse.from(ctx, result);
            })
    ),
};
