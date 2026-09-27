import { createEndpoint } from "colyseus";
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
};
