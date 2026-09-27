import type { ICacheStore } from "@/core/cache/cache.interface.js";
import type { createClient } from "redis";

export class RedisCacheStore implements ICacheStore {
    constructor(private readonly client: ReturnType<typeof createClient>) {}

    async get<T>(key: string): Promise<T | null> {
        const raw = (await this.client.get(key)) as string | null;
        if (raw === null) return null;
        return JSON.parse(raw) as T;
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const serialized = JSON.stringify(value);
        if (ttlSeconds) {
            await this.client.setEx(key, ttlSeconds, serialized);
        } else {
            await this.client.set(key, serialized);
        }
    }

    async setIfAbsent<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
        const result = await this.client.set(key, JSON.stringify(value), {
            NX: true,
            ...(ttlSeconds ? { EX: ttlSeconds } : {}),
        });
        return result === "OK";
    }

    async incr(key: string, ttlSeconds: number): Promise<number> {
        const [count] = await this.client.multi().incr(key).expire(key, ttlSeconds, "NX").exec();
        return Number(count);
    }

    async del(key: string): Promise<void> {
        await this.client.del(key);
    }

    async has(key: string): Promise<boolean> {
        return ((await this.client.exists(key)) as number) > 0;
    }
}
