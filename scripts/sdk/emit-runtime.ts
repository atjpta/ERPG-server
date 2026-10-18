import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { OutputFile } from "./write-files.js";

/**
 * Lớp runtime của SDK (Result, ApiClient, RoomClient, NetworkSettings...), asmdef và README cho client.
 * Nguồn nằm trong `scripts/sdk/runtime/` (cùng cấu trúc với thư mục Network của Unity); mỗi lần export được chép sang.
 * Sửa runtime = sửa file ở đây rồi `yarn unity:network`, không sửa trực tiếp bên Unity.
 */
const RUNTIME_DIR = join(dirname(fileURLToPath(import.meta.url)), "runtime");

export function emitRuntime(): OutputFile[] {
    const files: OutputFile[] = [];
    const visit = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) visit(full);
            else
                files.push({
                    path: relative(RUNTIME_DIR, full).replaceAll("\\", "/"),
                    content: readFileSync(full, "utf8"),
                });
        }
    };
    visit(RUNTIME_DIR);
    return files.sort((a, b) => a.path.localeCompare(b.path));
}
