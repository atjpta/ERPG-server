/**
 * Chạy các bài test tích hợp (service + DB dev, không cần server đang chạy): `yarn test:integration [bộ] [lọc tên]`.
 * Ví dụ `yarn test:integration friend` hoặc `yarn test:integration mail inbox`. Cần DB đã migrate + seed.
 */
import { bootstrap } from "./fixtures.js";
import { runAll } from "./harness.js";

const [suite, filter] = process.argv.slice(2);
const suites: Record<string, () => Promise<unknown>> = {
    friend: () => import("./friend-concurrency.test.js"),
    mail: () => import("./mail-transfer.test.js"),
    runtime: () => import("./player-runtime.test.js"),
};

await bootstrap();
for (const [name, load] of Object.entries(suites)) {
    if (!suite || suite === name) await load();
}
await runAll(filter);
