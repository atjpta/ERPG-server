import { createEndpoint } from "colyseus";
import { z } from "zod";
import { Response, RouterContainer } from "@/core/utils/response.util.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";

const prefix = "/maps";

export const mapController = {
    /** Public — client dùng để preload metadata map. */
    mapIndex: createEndpoint(prefix, { method: "GET" }, (ctx) =>
        RouterContainer(ctx, async () => {
            const maps = await mapService.listActive();
            return Response.ok({ data: maps });
        })
    ),

    /** Public — layout map (collider, spawn, NPC, portal) để client đối chiếu và dựng minimap. */
    mapContent: createEndpoint(
        `${prefix}/:code/content`,
        { method: "GET", params: z.object({ code: z.string().min(1).max(64) }) },
        (ctx) =>
            RouterContainer(ctx, async () => {
                const content = await mapService.getContent(ctx.params.code);
                return Response.ok({ data: content });
            })
    ),
};
