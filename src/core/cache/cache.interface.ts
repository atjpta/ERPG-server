export interface ICacheStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    /** Atomic: chỉ ghi khi key chưa tồn tại. Trả `true` nếu ghi được, `false` nếu key đã có. */
    setIfAbsent<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean>;
    /**
     * Atomic: tăng bộ đếm thêm 1 và trả giá trị mới. TTL chỉ đặt ở lần tạo key (fixed window) —
     * các lần tăng sau không kéo dài hạn.
     */
    incr(key: string, ttlSeconds: number): Promise<number>;
    del(key: string): Promise<void>;
    has(key: string): Promise<boolean>;
}
