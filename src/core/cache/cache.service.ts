import { ICacheStore } from "@/core/cache/cache.interface.js";
import { MemoryCacheStore } from "@/core/cache/stores/memory-cache.store.js";

class CacheService implements ICacheStore {
    private store: ICacheStore = new MemoryCacheStore();

    useStore(store: ICacheStore) {
        this.store = store;
    }

    get<T>(key: string): Promise<T | null> {
        return this.store.get<T>(key);
    }

    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        return this.store.set(key, value, ttlSeconds);
    }

    setIfAbsent<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
        return this.store.setIfAbsent(key, value, ttlSeconds);
    }

    incr(key: string, ttlSeconds: number): Promise<number> {
        return this.store.incr(key, ttlSeconds);
    }

    del(key: string): Promise<void> {
        return this.store.del(key);
    }

    has(key: string): Promise<boolean> {
        return this.store.has(key);
    }
}

export const cacheService = new CacheService();
