import { createEndpoint } from "colyseus";
import { UserMapCodeParamSchema } from "@/apis/user/maps/validators/user.map.validator.js";
import { HttpResponse, RouterContainer } from "@/core/utils/response.util.js";
import { userMapService } from "@/apis/user/maps/services/user.map.service.js";
import { z } from "zod";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import {
    UserMapContentResponse,
    UserMapSummaryResponse,
} from "@/apis/user/maps/validators/user.map.response.js";

const prefix = "/maps";

export const userMapController = {
    /** Public — client dùng để preload metadata map. */
    userMapIndex: createEndpoint(
        prefix,
        {
            method: "GET",
            sdk: {
                summary: "Metadata các map đang hoạt động (để preload).",
                auth: "none",
                response: z.array(UserMapSummaryResponse),
            },
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const maps = await userMapService.listActive();
                return HttpResponse.ok({ data: maps });
            })
    ),

    /** Public — layout map (collider, spawn, NPC, portal) để client đối chiếu và dựng minimap. */
    userMapContent: createEndpoint(
        `${prefix}/:code/content`,
        {
            method: "GET",
            sdk: {
                summary:
                    "Layout một map (collider, spawn, NPC, portal) để đối chiếu scene và dựng minimap.",
                auth: "none",
                response: UserMapContentResponse,
                errors: [MapErrorCode.MAP_NOT_FOUND],
            },
            params: UserMapCodeParamSchema,
        },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const content = await userMapService.getContent(ctx.params.code);
                return HttpResponse.ok({ data: content });
            })
    ),
};
