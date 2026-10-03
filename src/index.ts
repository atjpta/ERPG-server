import { listen } from "@colyseus/tools";
import { uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { createEndpoint, createRouter, defineServer, monitor, playground } from "colyseus";
import { networkInterfaces } from "os";
import { env } from "@/configs/env.config.js";
import { connectPostgres } from "@/configs/postgres.config.js";
import { applyCorsPolicy } from "@/configs/cors.config.js";
import { connectRedisCache, createRedisScaling } from "@/configs/redis.config.js";
import { loadControllers } from "@/core/utils/load-controllers.util.js";
import { createRooms } from "@/rooms/index.room.js";
import { setCacheDataApp } from "@/cache-data/index.js";

await connectPostgres();
await connectRedisCache();
applyCorsPolicy();
const controllers = await loadControllers();
await setCacheDataApp();
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
                res.status(404).json({
                    data: null,
                    message: "🔍 Not found page",
                    error: "Not found",
                    code: null,
                });
            });
        },
        routes: createRouter({
            health: createEndpoint("/health", { method: "GET" }, async () => {
                return { message: "OK" };
            }),
            ...controllers,
        }),
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
