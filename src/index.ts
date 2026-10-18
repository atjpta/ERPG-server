import { CommonCode } from "@/core/enums/common-code.enum.js";
import { listen } from "@colyseus/tools";
import { uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { createEndpoint, createRouter, defineServer, monitor, playground } from "colyseus";
import { networkInterfaces } from "os";
import { env } from "@/configs/env.config.js";
import { connectPostgres } from "@/configs/postgres.config.js";
import { applyCorsPolicy } from "@/configs/cors.config.js";
import { connectRedisCache, createRedisScaling } from "@/configs/redis.config.js";
import { routerErrorHandler } from "@/core/utils/response.util.js";
import { fail, ok } from "@/core/utils/result.util.js";
import { loadControllers } from "@/core/utils/load-controllers.util.js";
import { prefixEndpoints } from "@/core/utils/prefix-endpoints.util.js";
import { createRooms } from "@/rooms/index.room.js";
import { setCacheDataApp } from "@/cache-data/index.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { warnMapLayouts } from "@/modules/maps/seeds/game-map.seed.js";

await connectPostgres();
await connectRedisCache();
applyCorsPolicy();
const { admin, user } = await loadControllers();
await setCacheDataApp();
warnMapLayouts(await GameMapRepo.findIncompleteLayouts());
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
                res.status(404).json(fail(CommonCode.NOT_FOUND, "Not found"));
            });
        },
        routes: createRouter(
            {
                health: createEndpoint("/health", { method: "GET" }, async () => {
                    return ok();
                }),
                ...prefixEndpoints("/admin", admin),
                ...prefixEndpoints("/user", user),
            },
            { onError: routerErrorHandler }
        ),
        transport: new uWebSocketsTransport({}, {}),
    }),
    env.PORT
).then(() => {
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
