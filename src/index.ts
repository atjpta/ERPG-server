import { roomRuntimes } from "@/rooms/runtime/runtime.room.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { listen } from "@colyseus/tools";
import { uWebSocketClient, uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { extendClientSend } from "@/core/utils/client-send.util.js";
import {
    createEndpoint,
    createRouter,
    defineServer,
    matchMaker,
    monitor,
    playground,
} from "colyseus";
import { networkInterfaces } from "os";
import { env } from "@/configs/env.config.js";
import { connectPostgres } from "@/configs/postgres.config.js";
import { applyCorsPolicy } from "@/configs/cors.config.js";
import { connectRedisCache, createRedisScaling } from "@/configs/redis.config.js";
import { routerErrorHandler, Response } from "@/core/utils/response.util.js";
import { loadControllers } from "@/core/utils/load-controllers.util.js";
import { prefixEndpoints } from "@/core/utils/prefix-endpoints.util.js";
import {
    InitRoom,
    createRooms,
    pinGameServers,
    warnIfServerHostedElsewhere,
} from "@/rooms/index.room.js";
import { setCacheDataApp } from "@/cache-data/index.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { warnMapLayouts } from "@/modules/maps/seeds/game-map.seed.js";

await connectPostgres();
// Process phụ trách một hoặc nhiều game server (GAME_SERVER_CODES); mỗi server có runtime riêng, mọi room của nó dùng chung dữ liệu người chơi trong bộ nhớ.
await pinGameServers();
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
        // Có Redis thì Colyseus mặc định tạo room ở process ít room nhất: ghim lại để room của server này luôn ở process này.
        ...(env.REDIS_URI ? { selectProcessIdToCreateRoom: async () => matchMaker.processId } : {}),
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
).then(async (server) => {
    // Tắt có kế hoạch (SIGTERM/SIGINT): lưu hết dữ liệu người chơi đang giữ trong bộ nhớ trước khi đóng room.
    server.onBeforeShutdown(() => roomRuntimes.flushAll());
    await InitRoom().catch((error: unknown) => {
        console.error("[Rooms] bootstrap failed:", error);
    });
    await warnIfServerHostedElsewhere().catch((error: unknown) => {
        console.error("[Server] cannot verify the game server is hosted once:", error);
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
