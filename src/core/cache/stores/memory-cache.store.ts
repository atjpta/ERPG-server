import type { ICacheStore } from "@/core/cache/cache.interface.js";

interface Entry<T> {
    value: T;
    expiresAt: number | null;
}

export class MemoryCacheStore implements ICacheStore {
    private store = new Map<string, Entry<unknown>>();

    constructor() {
        // Key đã hết hạn nhưng không ai đọc lại (vd nonce OAuth đã dùng) sẽ không tự bị xoá — dọn định kỳ.
        setInterval(() => {
            for (const [key, entry] of this.store) {
                if (this.isExpired(entry)) this.store.delete(key);
            }
        }, 60_000).unref();
    }

    private isExpired(entry: Entry<unknown>): boolean {
        return entry.expiresAt !== null && Date.now() > entry.expiresAt;
    }

    async get<T>(key: string): Promise<T | null> {
        const entry = this.store.get(key) as Entry<T> | undefined;
        if (!entry) return null;
        if (this.isExpired(entry)) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        this.store.set(key, {
            value,
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
        });
    }

    async setIfAbsent<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
        // Không có `await` giữa lúc check và ghi → atomic trong single-thread Node.
        const entry = this.store.get(key);
        if (entry && !this.isExpired(entry)) return false;
        this.store.set(key, {
            value,
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
        });
        return true;
    }

    async incr(key: string, ttlSeconds: number): Promise<number> {
        const entry = this.store.get(key) as Entry<number> | undefined;
        if (entry && !this.isExpired(entry)) {
            entry.value += 1;
            return entry.value;
        }
        this.store.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
        return 1;
    }

    async del(key: string): Promise<void> {
        this.store.delete(key);
    }

    async has(key: string): Promise<boolean> {
        const entry = this.store.get(key);
        if (!entry) return false;
        if (this.isExpired(entry)) {
            this.store.delete(key);
            return false;
        }
        return true;
    }
}
