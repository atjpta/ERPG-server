import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportClientNetwork } from "./sdk/index.js";

/*
 * Xuất SDK network cho Unity: `yarn unity:network [thư-mục-Network] [--admin] [--check]`.
 * Xem docs/client-sdk.md.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const outArg = args.find((arg) => !arg.startsWith("--")) ?? "../ERPG/Assets/Src/Scripts/Network";
const outDir = resolve(root, outArg);
const check = flags.has("--check");

try {
    const { report, warnings, counts } = await exportClientNetwork({
        root,
        outDir,
        schemaDir: outDir,
        admin: flags.has("--admin"),
        check,
    });
    for (const warning of warnings) console.warn(`⚠ ${warning}`);
    console.log(
        `${check ? "[check] " : ""}${counts.errorEnums} enum mã lỗi, ${counts.endpoints} endpoint, ${counts.rooms} room → ${outDir}`
    );
    console.log(
        `  ghi ${report.written.length}, xoá ${report.removed.length}, giữ nguyên ${report.unchanged}`
    );
    if (check && (report.written.length > 0 || report.removed.length > 0)) {
        console.error("SDK lệch với server — chạy `yarn unity:network`:");
        for (const path of [...report.written, ...report.removed]) console.error(`  ${path}`);
        process.exit(1);
    }
    process.exit(0);
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
