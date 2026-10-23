import { sql } from "drizzle-orm";
import type { Queryable } from "@/configs/postgres.config.js";

/**
 * Khoá tư vấn (advisory lock) mức transaction theo tên khoá, nhả khi transaction kết thúc — để các thao tác "đếm rồi ghi" hoặc
 * "kiểm tra rồi ghi" trên cùng một đối tượng chạy tuần tự giữa mọi process, thay vì đua nhau (vượt giới hạn, tạo quan hệ sau khi bị
 * chặn...). PHẢI gọi bên trong `withTransaction` (ngoài transaction khoá bị nhả ngay).
 *
 * Nhiều khoá được lấy theo thứ tự đã sắp xếp: hai transaction cùng cần {A, B} luôn lấy A rồi B nên không deadlock.
 */
export async function lockKeys(tx: Queryable, keys: readonly string[]): Promise<void> {
    for (const key of [...new Set(keys)].sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
    }
}
