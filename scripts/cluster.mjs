/**
 * Chạy server trên 1 hoặc N process (xem docs/deployment.md).
 *
 *   dotenvx run -f .env.production -- node scripts/cluster.mjs           # đọc env đã giải mã, chạy build/index.js
 *   yarn start:cluster                                                   # như trên (env đã có sẵn trong shell)
 *   yarn dev:cluster                                                     # chạy từ src bằng tsx
 *   CLUSTER_PROCESSES=3 node scripts/cluster.mjs --dry-run               # chỉ in kế hoạch, không chạy
 *
 * Số process = `CLUSTER_PROCESSES` (mặc định = số CPU). Chỉ 1 process (VPS 1 CPU) → một process làm cả `global` và `world`, không
 * cần Redis. N > 1 → process 0 làm `global,world`, các process còn lại làm `world`; cần `REDIS_URI`. Mỗi process một port
 * (`PORT` + chỉ số). Sau reverse proxy, đặt `CLUSTER_PUBLIC_ADDRESS` có `{port}`, ví dụ `https://game.example.com/p{port}`,
 * để mỗi process quảng bá đúng địa chỉ cho client.
 *
 * Tắt (SIGINT / SIGTERM): dừng các process chỉ có `world` trước (để gửi bản sao lần cuối lên global), rồi mới tới process 0.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";

const args = process.argv.slice(2);
const dev = args.includes("--dev");
const dryRun = args.includes("--dry-run");

const count = Math.max(1, Number(process.env.CLUSTER_PROCESSES ?? availableParallelism()));
const basePort = Number(process.env.PORT ?? 2567);
const addressTemplate = process.env.CLUSTER_PUBLIC_ADDRESS;
const SHUTDOWN_TIMEOUT_MS = Number(process.env.CLUSTER_SHUTDOWN_TIMEOUT_MS ?? 30_000);
const MAX_RAPID_RESTARTS = 5;
const RAPID_WINDOW_MS = 60_000;

if (count > 1 && !process.env.REDIS_URI) {
    console.error(
        `[cluster] ${count} processes need REDIS_URI (rooms talk through Redis presence). ` +
            "On a 1-CPU VPS set CLUSTER_PROCESSES=1."
    );
    process.exit(1);
}

const plan = Array.from({ length: count }, (_, index) => {
    const port = basePort + index;
    return {
        name: `p${index}`,
        port,
        // 1 process: để mặc định (cả hai vai trò). N process: process 0 giữ global (và một phần world), còn lại chỉ world.
        roles: count === 1 ? undefined : index === 0 ? "global,world" : "world",
        publicAddress: addressTemplate?.replaceAll("{port}", String(port)),
    };
});

const childEnv = (entry) => ({
    ...process.env,
    PORT: String(entry.port),
    ...(entry.roles ? { PROCESS_ROLES: entry.roles } : {}),
    ...(entry.publicAddress ? { PUBLIC_ADDRESS: entry.publicAddress } : {}),
});

const command = dev
    ? [process.execPath, ["--import", "tsx", "src/index.ts"]]
    : [process.execPath, ["build/index.js"]];

if (dryRun) {
    console.info(JSON.stringify({ dev, count, command: command.flat().join(" "), plan }, null, 2));
    process.exit(0);
}

let stopping = false;
const children = new Map();

function start(entry, restarts = []) {
    const child = spawn(command[0], command[1], { env: childEnv(entry), stdio: "inherit" });
    children.set(entry.name, { entry, child });
    console.info(
        `[cluster] ${entry.name} started pid=${child.pid} port=${entry.port} roles=${entry.roles ?? "global,world"}`
    );
    child.on("exit", (code, signal) => {
        children.delete(entry.name);
        if (stopping) return;
        const now = Date.now();
        const recent = [...restarts.filter((at) => now - at < RAPID_WINDOW_MS), now];
        console.error(`[cluster] ${entry.name} exited (code=${code}, signal=${signal})`);
        if (recent.length > MAX_RAPID_RESTARTS) {
            console.error(`[cluster] ${entry.name} keeps crashing: giving up on it`);
            if (children.size === 0) process.exit(1);
            return;
        }
        setTimeout(() => !stopping && start(entry, recent), 1000 * recent.length);
    });
}

async function stopAll() {
    if (stopping) return;
    stopping = true;
    const exited = (name) =>
        new Promise((resolve) => {
            const item = children.get(name);
            if (!item) return resolve();
            const timer = setTimeout(() => {
                console.error(`[cluster] ${name} did not stop in time: killing`);
                item.child.kill("SIGKILL");
            }, SHUTDOWN_TIMEOUT_MS);
            item.child.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });
            item.child.kill("SIGTERM");
        });
    // World-only trước: chúng gửi bản sao lần cuối lên global nên global phải còn sống.
    const worldOnly = plan.filter((entry) => entry.roles === "world").map((entry) => entry.name);
    await Promise.all(worldOnly.map(exited));
    await Promise.all(
        plan.filter((entry) => !worldOnly.includes(entry.name)).map((e) => exited(e.name))
    );
    process.exit(0);
}

process.on("SIGINT", () => void stopAll());
process.on("SIGTERM", () => void stopAll());

console.info(`[cluster] ${count} process(es)${dev ? " (dev)" : ""}`);
for (const entry of plan) start(entry);
