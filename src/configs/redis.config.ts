import { RedisDriver, RedisPresence } from "colyseus";
import { createClient } from "redis";
import { env } from "@/configs/env.config.js";
import { cacheService } from "@/core/cache/cache.service.js";
import { RedisCacheStore } from "@/core/cache/stores/redis-cache.store.js";

/** Driver + presence cho Colyseus khi scale nhiều process — chỉ bật khi có `REDIS_URI`. */
export const createRedisScaling = () =>
    env.REDIS_URI
        ? { driver: new RedisDriver(env.REDIS_URI), presence: new RedisPresence(env.REDIS_URI) }
        : {};

/**
 * Có `REDIS_URI` → chuyển `cacheService` sang Redis để nonce/idToken đã dùng và bộ đếm rate limit
 * dùng chung giữa các process. Không có → giữ `MemoryCacheStore` (chỉ đúng khi chạy 1 process).
 */
export async function connectRedisCache() {
    if (!env.REDIS_URI) {
        console.info("[Redis] REDIS_URI not set — cache in memory (single process only)");
        return;
    }
    try {
        const client = createClient({ url: env.REDIS_URI });
        client.on("error", (err) => console.error("[Redis] Client error:", err));
        await client.connect();
        cacheService.useStore(new RedisCacheStore(client as ReturnType<typeof createClient>));
        console.info(`[Redis] Connected: ${new URL(env.REDIS_URI).host}`);
    } catch (err) {
        console.error("[Redis] Connection failed:", err);
        process.exit(1);
    }
}
