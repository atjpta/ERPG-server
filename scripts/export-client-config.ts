/**
 * Xuất config dùng chung (skills.json) sang project Unity mà không chạy lại seed.
 * `yarn config:export` — thư mục đích là tham số đầu tiên (đặt trong package.json).
 */
import { connectPostgres } from "@/configs/postgres.config.js";
import { exportClientConfig } from "@/seeds/client-config.export.js";

const outputDir = process.argv[2];
if (!outputDir)
    throw new Error("Usage: tsx scripts/export-client-config.ts <unity Resources/Config dir>");

await connectPostgres();
await exportClientConfig(outputDir);
process.exit(0);
