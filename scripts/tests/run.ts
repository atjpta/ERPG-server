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
    giftcode: () => import("./gift-code.test.js"),
    state: () => import("./player-state.test.js"),
    remote: () => import("./remote-player-state.test.js"),
    world: () => import("./world-state.test.js"),
    response: () => import("./response.test.js"),
    calc: async () => {
        await import("./calc.test.js");
        await import("./calc-formulas.test.js");
    },
};

await bootstrap();
for (const [name, load] of Object.entries(suites)) {
    if (!suite || suite === name) await load();
}
await runAll(filter);
