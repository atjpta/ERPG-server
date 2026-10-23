/**
 * Đo tải: tạo N bot (tài khoản + nhân vật thật), cho cùng vào room `world` (và `global` như client thật) rồi di chuyển liên tục, đo phía server
 * (CPU / RAM của process, số giao dịch DB) và phía client (khoảng cách giữa các patch state, RTT của một request mẫu).
 *
 *   yarn load-test                         # các mức 25,50,100 bot, mỗi mức giữ 20 giây
 *   BOTS=100,200,400 HOLD=30 yarn load-test
 *   CLEANUP=1 yarn load-test               # xoá toàn bộ bot (load_*@erpg.local) rồi thoát
 *
 * Cần server đang chạy (SERVER_URL, mặc định http://localhost:2567; SERVER_PORT để đo CPU/RAM đúng process, mặc định lấy từ SERVER_URL).
 * Bot và server chạy cùng máy nên CPU của bot cũng tranh với server: xem dòng "loadgen" — nếu cao thì số đo là cận trên của phía client.
 */
import { Response } from "@/core/response/response.js";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { Client, type Room } from "@colyseus/sdk";
import { like } from "drizzle-orm";
import { setCacheDataApp } from "@/cache-data/index.js";
import { characterService } from "@/modules/player/services/character.service.js";
import { userAuthService } from "@/modules/auth/services/user-auth.service.js";
import { connectPostgres, db } from "@/configs/postgres.config.js";
import { Players } from "@/modules/auth/entities/player.entity.js";
import { Users } from "@/modules/auth/entities/user.entity.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { inArray, sql } from "drizzle-orm";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:2567";
const SERVER_PORT = Number(process.env.SERVER_PORT ?? new URL(SERVER_URL).port ?? 2567);
const LEVELS = (process.env.BOTS ?? "25,50,100").split(",").map((value) => Number(value.trim()));
const HOLD_SECONDS = Number(process.env.HOLD ?? 20);
const WITH_GLOBAL = process.env.WITH_GLOBAL !== "0";
const INPUT_INTERVAL_MS = 50;
const SAMPLED_BOTS = 20;
const EMAIL_PREFIX = "load_";
const EMAIL_DOMAIN = "@erpg.local";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values: number[], p: number) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

interface Bot {
    index: number;
    playerToken: string;
    serverId: string;
    mapCode: string;
}

await connectPostgres();

if (process.env.CLEANUP === "1") {
    const users = await db
        .select({ id: Users.id })
        .from(Users)
        .where(like(Users.email, `${EMAIL_PREFIX}%${EMAIL_DOMAIN}`));
    const ids = users.map((user) => user.id);
    if (ids.length > 0) {
        await db.delete(Players).where(inArray(Players.userId, ids));
        await db.delete(Users).where(inArray(Users.id, ids));
    }
    console.info(`Đã xoá ${ids.length} bot`);
    process.exit(0);
}

await setCacheDataApp();
const maxBots = Math.max(...LEVELS);

/** Tạo (hoặc nạp lại) `maxBots` bot, không qua HTTP nên không vướng giới hạn tần suất đăng ký. */
async function provision(): Promise<Bot[]> {
    const starter = classService.listStarter()[0];
    const bots: Bot[] = [];
    let created = 0;
    const next = { value: 0 };
    const worker = async () => {
        for (;;) {
            const index = next.value++;
            if (index >= maxBots) return;
            const email = `${EMAIL_PREFIX}${index}${EMAIL_DOMAIN}`;
            const client = {
                platform: "android",
                clientVersion: "0.0.1",
                device: "load-test",
            } as never;
            const credentials = { email, password: "123456", ...(client as object) } as never;
            let authed = await userAuthService.register(credentials);
            if (Response.isError(authed)) authed = await userAuthService.login(credentials);
            else created++;
            if (Response.isError(authed)) throw new Error(`auth failed: ${authed.errorCode}`);
            const session = authed.data as unknown as { token: string } & Record<string, unknown>;
            let playerToken = (session as { playerToken?: string | null }).playerToken ?? null;
            let player =
                (session as { player?: { serverId: string; mapCode: string } | null }).player ??
                null;
            if (!playerToken || !player) {
                const claims = JSON.parse(
                    Buffer.from(session.token.split(".")[1], "base64url").toString()
                ) as {
                    userId: string;
                    userSessionId: string;
                };
                const result = await characterService.createCharacter({
                    userId: claims.userId,
                    sessionId: claims.userSessionId,
                    body: { name: `Load${index}`, classCode: starter.code } as never,
                });
                if (Response.isError(result))
                    throw new Error(`createCharacter failed: ${result.errorCode}`);
                playerToken = result.data.playerToken;
                player = result.data.player as never;
            }
            bots[index] = {
                index,
                playerToken: playerToken!,
                serverId: player!.serverId,
                mapCode: player!.mapCode,
            };
        }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    console.info(`Bot sẵn sàng: ${bots.length} (tạo mới ${created})`);
    return bots;
}

// ---------------------------------------------------------------- đo phía server (OS + DB)
function serverProcess(): { pid: number; cpuSeconds: number; workingSetMb: number } | undefined {
    try {
        const out = execFileSync(
            "powershell",
            [
                "-NoProfile",
                "-Command",
                `$pid2=(Get-NetTCPConnection -LocalPort ${SERVER_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess; if($pid2){$p=Get-Process -Id $pid2; "$pid2,$($p.TotalProcessorTime.TotalSeconds),$([math]::Round($p.WorkingSet64/1MB,1))"}`,
            ],
            { encoding: "utf8" }
        ).trim();
        if (!out) return undefined;
        const [pid, cpu, ws] = out.split(",");
        return { pid: Number(pid), cpuSeconds: Number(cpu), workingSetMb: Number(ws) };
    } catch {
        return undefined;
    }
}

async function dbCounters() {
    const rows = await db.execute(
        sql`select xact_commit as commits, tup_updated as updated, tup_inserted as inserted from pg_stat_database where datname = current_database()`
    );
    const row = (rows as unknown as Record<string, string>[])[0];
    return {
        commits: Number(row.commits),
        updated: Number(row.updated),
        inserted: Number(row.inserted),
    };
}

// ---------------------------------------------------------------- một bot
interface Connected {
    world: Room;
    global?: Room;
    stop: () => void;
    patchTimes: number[];
    rtts: number[];
    failed?: string;
}

async function connect(bot: Bot, sampled: boolean): Promise<Connected> {
    const sdk = new Client(SERVER_URL);
    sdk.auth.token = bot.playerToken;
    const connected: Connected = {
        world: undefined as never,
        stop: () => undefined,
        patchTimes: [],
        rtts: [],
    };
    const world = await sdk.joinOrCreate("world", { serverId: bot.serverId, mapCode: bot.mapCode });
    connected.world = world;
    world.onMessage("*", () => undefined);
    if (sampled) world.onStateChange(() => connected.patchTimes.push(performance.now()));
    else world.onStateChange(() => undefined);
    if (WITH_GLOBAL) {
        const global = await sdk.joinOrCreate("global", { serverId: bot.serverId });
        global.onMessage("*", () => undefined);
        connected.global = global;
    }

    const input = world.input<{ moveX: number; moveY: number }>({ mode: "reliable" });
    let direction = { x: 0, y: 0 };
    let switchAt = 0;
    const timer = setInterval(() => {
        const now = performance.now();
        if (now >= switchAt) {
            const angle = Math.random() * Math.PI * 2;
            direction =
                Math.random() < 0.2
                    ? { x: 0, y: 0 }
                    : { x: Math.sign(Math.cos(angle)), y: Math.sign(Math.sin(angle)) };
            switchAt = now + 500 + Math.random() * 1500;
        }
        input.data.moveX = direction.x;
        input.data.moveY = direction.y;
        input.send();
    }, INPUT_INTERVAL_MS);
    // RTT mẫu: request tới message không có handler bị từ chối ngay, nên thời gian chờ ≈ RTT + xử lý ở server.
    const probe = sampled
        ? setInterval(async () => {
              const start = performance.now();
              await (world as Room<any>)
                  .request("noSuchMessage" as never, undefined, { timeout: 5000 })
                  .catch((): void => undefined);
              connected.rtts.push(performance.now() - start);
          }, 1000)
        : undefined;
    connected.stop = () => {
        clearInterval(timer);
        if (probe) clearInterval(probe);
    };
    return connected;
}

// ---------------------------------------------------------------- chạy từng mức
const bots = await provision();
console.info(
    `\nMáy: ${SERVER_URL} · giữ ${HOLD_SECONDS}s mỗi mức · global=${WITH_GLOBAL ? "có" : "không"} · input ${1000 / INPUT_INTERVAL_MS}Hz/bot\n`
);
const rows: string[] = [];

for (const count of LEVELS) {
    const slice = bots.slice(0, count);
    const connections: Connected[] = [];
    let failures = 0;
    const joinStart = performance.now();
    let cursor = 0;
    await Promise.all(
        Array.from({ length: 10 }, async () => {
            for (;;) {
                const index = cursor++;
                if (index >= slice.length) return;
                try {
                    connections[index] = await connect(slice[index], index < SAMPLED_BOTS);
                } catch (error) {
                    failures++;
                    if (failures <= 3)
                        console.warn(`  bot ${index} join lỗi: ${(error as Error).message}`);
                }
            }
        })
    );
    const joined = connections.filter(Boolean);
    const joinSeconds = (performance.now() - joinStart) / 1000;
    const channels = new Set(joined.map((c) => c.world.roomId)).size;

    await sleep(3000); // để mọi thứ ổn định trước khi đo
    for (const c of joined) {
        c.patchTimes.length = 0;
        c.rtts.length = 0;
    }
    const before = serverProcess();
    const dbBefore = await dbCounters();
    const loadgenBefore = process.cpuUsage();
    const start = performance.now();
    await sleep(HOLD_SECONDS * 1000);
    const seconds = (performance.now() - start) / 1000;
    const after = serverProcess();
    const dbAfter = await dbCounters();
    const loadgen = process.cpuUsage(loadgenBefore);

    const gaps: number[] = [];
    const rtts: number[] = [];
    for (const c of joined) {
        for (let i = 1; i < c.patchTimes.length; i++)
            gaps.push(c.patchTimes[i] - c.patchTimes[i - 1]);
        rtts.push(...c.rtts);
    }
    const patchRate =
        joined.slice(0, SAMPLED_BOTS).reduce((sum, c) => sum + c.patchTimes.length, 0) /
        Math.max(1, Math.min(SAMPLED_BOTS, joined.length)) /
        seconds;
    const serverCpu =
        before && after ? ((after.cpuSeconds - before.cpuSeconds) / seconds) * 100 : NaN;
    const loadgenCpu = ((loadgen.user + loadgen.system) / 1e6 / seconds) * 100;

    rows.push(
        [
            String(joined.length).padStart(5),
            String(channels).padStart(4),
            `${joinSeconds.toFixed(1)}s`.padStart(6),
            Number.isNaN(serverCpu) ? "   n/a" : `${serverCpu.toFixed(0)}%`.padStart(6),
            after ? `${after.workingSetMb.toFixed(0)}MB`.padStart(7) : "    n/a",
            `${patchRate.toFixed(1)}/s`.padStart(7),
            `${percentile(gaps, 50).toFixed(0)}/${percentile(gaps, 95).toFixed(0)}/${percentile(gaps, 100).toFixed(0)}ms`.padStart(
                14
            ),
            `${percentile(rtts, 50).toFixed(0)}/${percentile(rtts, 95).toFixed(0)}/${percentile(rtts, 100).toFixed(0)}ms`.padStart(
                14
            ),
            `${((dbAfter.commits - dbBefore.commits) / seconds).toFixed(1)}`.padStart(8),
            `${((dbAfter.updated - dbBefore.updated) / seconds).toFixed(1)}`.padStart(8),
            `${loadgenCpu.toFixed(0)}%`.padStart(9),
            String(failures).padStart(5),
        ].join(" ")
    );

    for (const c of joined) {
        c.stop();
        await c.world.leave().catch((): void => undefined);
        await c.global?.leave().catch((): void => undefined);
    }
    await sleep(2000);
}

console.info(
    [
        "bots".padStart(5),
        "room".padStart(4),
        "join".padStart(6),
        "srvCPU".padStart(6),
        "srvRAM".padStart(7),
        "patch".padStart(7),
        "gap p50/95/max".padStart(14),
        "rtt p50/95/max".padStart(14),
        "db tx/s".padStart(8),
        "db upd/s".padStart(8),
        "loadgen".padStart(9),
        "fail".padStart(5),
    ].join(" ")
);
for (const row of rows) console.info(row);
console.info(
    "\nsrvCPU: % của MỘT lõi (100% = một lõi đầy). patch: số lần nhận state/s mỗi bot (mong đợi ≈ 1000/patchRate). gap: khoảng giữa hai patch."
);
process.exit(0);
