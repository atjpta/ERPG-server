import { PlayerStateManager } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { listen } from "@colyseus/tools";
import { uWebSocketsTransport } from "@colyseus/uwebsockets-transport";
import { createEndpoint, createRouter, defineServer, monitor, playground } from "colyseus";
import { networkInterfaces } from "os";
import { env } from "@/configs/env.config.js";
import { connectPostgres } from "@/configs/postgres.config.js";
import { applyCorsPolicy } from "@/configs/cors.config.js";
import { connectRedisCache, createRedisScaling } from "@/configs/redis.config.js";
import { errorEnvelope } from "@/core/response/envelope.js";
import { HttpResponse, routerErrorHandler } from "@/core/response/http-response.js";
import { loadControllers } from "@/core/utils/load-controllers.util.js";
import { prefixEndpoints } from "@/core/utils/prefix-endpoints.util.js";
import {
    InitRoom,
    announceProcessRoles,
    selectProcessIdForRoom,
    createRooms,
    pinGameServers,
    warnIfServerHostedElsewhere,
} from "@/rooms/index.room.js";
import { setCacheDataApp } from "@/cache-data/index.js";
import { GameMapRepo } from "@/modules/maps/repositories/game-map.repository.js";
import { warnMapLayouts } from "@/modules/maps/seeds/game-map.seed.js";
import { Encoder } from "@colyseus/schema";

// Room có nhiều người chơi (state đầy đủ lúc vào room) vượt buffer mã hoá mặc định 8 KB: client không nhận được state.
Encoder.BUFFER_SIZE = 64 * 1024;

await connectPostgres();
// Process phụ trách một hoặc nhiều game server (GAME_SERVER_CODES); mỗi server có runtime riêng, mọi room của nó dùng chung dữ liệu người chơi trong bộ nhớ.
await pinGameServers();
await connectRedisCache();
applyCorsPolicy();
const { admin, user } = await loadControllers();
await setCacheDataApp();
warnMapLayouts(await GameMapRepo.findIncompleteLayouts());

await listen(
    defineServer({
        rooms: createRooms(),
        ...createRedisScaling(),
        // Nhiều process sau reverse proxy: mỗi process quảng bá địa chỉ riêng cho client (xem docs/deployment.md).
        ...(env.PUBLIC_ADDRESS ? { publicAddress: env.PUBLIC_ADDRESS } : {}),
        // Có Redis thì Colyseus mặc định tạo room ở process ít room nhất: chọn theo vai trò của process (`PROCESS_ROLES`) — process có vai
        // trò đó thì tạo tại chỗ, không thì chuyển cho process còn sống có vai trò đó.
        ...(env.REDIS_URI
            ? {
                  selectProcessIdToCreateRoom: async (roomName: string) =>
                      selectProcessIdForRoom(roomName),
              }
            : {}),
        express: (app) => {
            if (env.NODE_ENV !== "production") {
                app.use("/monitor", monitor());
                app.use("/", playground());
            }
            app.use((_req, res) => {
                res.status(404).json(errorEnvelope(CommonCode.NOT_FOUND));
            });
        },
        routes: createRouter(
            {
                health: createEndpoint("/health", { method: "GET" }, async () => {
                    return HttpResponse.success();
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
    const stopAnnouncing = announceProcessRoles();
    server.onBeforeShutdown(async () => {
        await stopAnnouncing();
        await PlayerStateManager.flushAllRemote();
    });
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
