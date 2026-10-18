import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MANIFEST = ".schema-manifest.json";
const EXPORT_PATTERN = /export\s+(?:abstract\s+)?(?:class|interface|enum|type|const)\s+(\w+)/g;

function walk(directory, out = []) {
    if (!existsSync(directory)) return out;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
}

/**
 * Tên kiểu export trong `src/rooms/<room>/**` → tên room (`World`, `Party`). Kiểu không nằm trong room nào
 * (enum của modules, catalog code, enum chung) thuộc `Common`.
 */
export function buildRoomIndex(roomsDirectory) {
    const index = new Map();
    for (const room of readdirSync(roomsDirectory, { withFileTypes: true })) {
        if (!room.isDirectory()) continue;
        const name = room.name[0].toUpperCase() + room.name.slice(1);
        for (const file of walk(join(roomsDirectory, room.name))) {
            for (const match of readFileSync(file, "utf8").matchAll(EXPORT_PATTERN)) {
                if (!index.has(match[1])) index.set(match[1], name);
            }
        }
    }
    return index;
}

/** Đường dẫn trong thư mục Network cho file C# sinh ra. */
export function schemaTarget(fileName, roomIndex) {
    const room = roomIndex.get(fileName.replace(/\.cs$/, ""));
    return room ? `Room/${room}/Schema/${fileName}` : `Common/${fileName}`;
}

/**
 * Chép các file schema (thư mục phẳng do codegen) vào `networkDirectory` theo room. Chỉ ghi file đổi nội dung và
 * xoá file đã sinh lần trước mà lần này không còn (theo manifest). Dọn bản cũ `Schema/` phẳng nếu còn.
 */
export function distributeSchemas({ flatDirectory, networkDirectory, roomIndex }) {
    // Enum mã lỗi bị codegen kéo theo qua import; SDK đã sinh riêng trong Errors/ (namespace ERPG.Network).
    const files = readdirSync(flatDirectory).filter(
        (name) => name.endsWith(".cs") && !/(^CommonCode|ErrorCode)\.cs$/.test(name)
    );
    const current = new Set();
    let written = 0;

    for (const name of files) {
        const relative = schemaTarget(name, roomIndex);
        current.add(relative);
        const target = join(networkDirectory, relative);
        const source = readFileSync(join(flatDirectory, name), "utf8");
        if (existsSync(target) && readFileSync(target, "utf8") === source) continue;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, source);
        written++;
    }

    const manifestPath = join(networkDirectory, MANIFEST);
    const previous = existsSync(manifestPath)
        ? (JSON.parse(readFileSync(manifestPath, "utf8")).files ?? [])
        : [];
    let removed = 0;
    for (const stale of previous.filter((path) => !current.has(path))) {
        const target = join(networkDirectory, stale);
        if (!existsSync(target)) continue;
        rmSync(target);
        rmSync(`${target}.meta`, { force: true });
        removed++;
    }

    // Bản cũ: mọi schema nằm phẳng trong Network/Schema (asmdef riêng).
    const legacy = join(networkDirectory, "Schema");
    if (existsSync(join(legacy, "ERPG.Schema.asmdef"))) {
        rmSync(legacy, { recursive: true, force: true });
        rmSync(`${legacy}.meta`, { force: true });
    }

    writeFileSync(manifestPath, JSON.stringify({ files: [...current].sort() }, null, 2) + "\n");
    return { total: files.length, written, removed };
}
