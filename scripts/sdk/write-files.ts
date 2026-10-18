import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    readdirSync,
    rmdirSync,
} from "node:fs";
import { dirname, join } from "node:path";

export interface OutputFile {
    /** Đường dẫn tương đối trong thư mục Network (dấu `/`). */
    path: string;
    content: string;
}

const MANIFEST = ".sdk-manifest.json";

export interface WriteReport {
    written: string[];
    removed: string[];
    unchanged: number;
}

function normalize(content: string): string {
    return content.replace(/\r\n/g, "\n");
}

/**
 * Ghi file sinh vào `outDir`: chỉ ghi file đổi nội dung, xoá file cũ có trong manifest mà lần này không sinh ra.
 * `check` = chỉ so sánh (không ghi), dùng cho CI. File viết tay (không có trong manifest) không bao giờ bị đụng.
 */
export function writeFiles(outDir: string, files: OutputFile[], check: boolean): WriteReport {
    const report: WriteReport = { written: [], removed: [], unchanged: 0 };
    const manifestPath = join(outDir, MANIFEST);
    const previous: string[] = existsSync(manifestPath)
        ? (JSON.parse(readFileSync(manifestPath, "utf8")).files ?? [])
        : [];

    for (const file of files) {
        const target = join(outDir, file.path);
        const existing = existsSync(target) ? normalize(readFileSync(target, "utf8")) : undefined;
        if (existing === normalize(file.content)) {
            report.unchanged++;
            continue;
        }
        report.written.push(file.path);
        if (check) continue;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content, "utf8");
    }

    const current = new Set(files.map((file) => file.path));
    for (const stale of previous.filter((path) => !current.has(path))) {
        const target = join(outDir, stale);
        if (!existsSync(target)) continue;
        report.removed.push(stale);
        if (check) continue;
        rmSync(target);
        rmSync(`${target}.meta`, { force: true });
        pruneEmptyDirs(outDir, dirname(target));
    }

    if (!check) {
        mkdirSync(outDir, { recursive: true });
        const manifest = JSON.stringify({ files: [...current].sort() }, null, 2) + "\n";
        if (
            !existsSync(manifestPath) ||
            normalize(readFileSync(manifestPath, "utf8")) !== manifest
        ) {
            writeFileSync(manifestPath, manifest, "utf8");
        }
    }
    return report;
}

/** Xoá thư mục rỗng (kèm `.meta` của Unity) từ `dir` ngược lên tới `root`. */
function pruneEmptyDirs(root: string, dir: string) {
    let current = dir;
    while (
        current.length > root.length &&
        existsSync(current) &&
        readdirSync(current).length === 0
    ) {
        rmdirSync(current);
        rmSync(`${current}.meta`, { force: true });
        current = dirname(current);
    }
}
