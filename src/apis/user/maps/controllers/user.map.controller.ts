import { createEndpoint } from "colyseus";
import { UserMapCodeParamSchema } from "@/apis/user/maps/validators/user.map.validator.js";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { userMapService } from "@/apis/user/maps/services/user.map.service.js";

const prefix = "/maps";

export const userMapController = {
    /** Public — client dùng để preload metadata map. */
    userMapIndex: createEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const maps = await userMapService.listActive();
            return Response.ok({ data: maps });
        })
    ),

    /** Public — layout map (collider, spawn, NPC, portal) để client đối chiếu và dựng minimap. */
    userMapContent: createEndpoint(
        `${prefix}/:code/content`,
        { method: "GET", params: UserMapCodeParamSchema },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const content = await userMapService.getContent(ctx.params.code);
                return Response.ok({ data: content });
            })
    ),
};
