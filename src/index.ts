import { CommonCode } from "@/core/enums/common-code.enum.js";
import { listen } from "@colyseus/tools";
import { uWebSocketClient, uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { extendClientSend } from "@/core/utils/client-send.util.js";
import { createEndpoint, createRouter, defineServer, monitor, playground } from "colyseus";
import { networkInterfaces } from "os";
import { env } from "@/configs/env.config.js";
import { connectPostgres } from "@/configs/postgres.config.js";
import { applyCorsPolicy } from "@/configs/cors.config.js";
import { connectRedisCache, createRedisScaling } from "@/configs/redis.config.js";
import { routerErrorHandler, Response } from "@/core/utils/response.util.js";
import { loadControllers } from "@/core/utils/load-controllers.util.js";
import { prefixEndpoints } from "@/core/utils/prefix-endpoints.util.js";
import { InitRoom, createRooms } from "@/rooms/index.room.js";
import { setCacheDataApp } from "@/cache-data/index.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { warnMapLayouts } from "@/modules/maps/seeds/game-map.seed.js";

await connectPostgres();
await connectRedisCache();
applyCorsPolicy();
const { admin, user } = await loadControllers();
await setCacheDataApp();
warnMapLayouts(await GameMapRepo.findIncompleteLayouts());
extendClientSend(uWebSocketClient.prototype);

await listen(
    defineServer({
        rooms: createRooms(),
        ...createRedisScaling(),
        express: (app) => {
            if (env.NODE_ENV !== "production") {
                app.use("/monitor", monitor());
                app.use("/", playground());
            }
            app.use((_req, res) => {
                res.status(404).json(Response.error(CommonCode.NOT_FOUND, "Not found"));
            });
        },
        routes: createRouter(
            {
                health: createEndpoint("/health", { method: "GET" }, async () => {
                    return Response.success();
                }),
                ...prefixEndpoints("/admin", admin),
                ...prefixEndpoints("/user", user),
            },
            { onError: routerErrorHandler }
        ),
        transport: new uWebSocketsTransport({}, {}),
    }),
    env.PORT
).then(async () => {
    await InitRoom().catch((error: unknown) => {
        console.error("[Rooms] bootstrap failed:", error);
    });
    if (env.NODE_ENV === "production") return;

    const port = env.PORT;
    const networkIPs = Object.values(networkInterfaces())
        .flat()
        .filter((iface) => iface?.family === "IPv4" && !iface.internal)
        .map((iface) => iface!.address);

    console.info(`\n  ➜  Local:   http://localhost:${port}/  ·  ws://localhost:${port}/`);
    networkIPs.forEach((ip) => {
        console.info(`  ➜  Network: http://${ip}:${port}/  ·  ws://${ip}:${port}/`);
    });
});
