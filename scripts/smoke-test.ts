/**
 * Smoke test end-to-end: đăng ký (tự tạo player) → join room `world` → di chuyển → lưu vị trí.
 * Chạy khi server đang bật: `yarn smoke` (mặc định http://localhost:2567, đổi bằng env SERVER_URL).
 */
import { Client } from "@colyseus/sdk";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:2567";

async function api<T = any>(method: string, path: string, body?: unknown, token?: string) {
    const res = await fetch(`${SERVER_URL}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as { data: T; message: string; code: string | null };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    console.info(`✅ ${method} ${path} → ${res.status}`);
    return json.data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const client = { platform: "android", clientVersion: "0.0.1", device: "smoke-test" };
const email = `smoke_${Date.now()}@erpg.local`;

await api("GET", "/master-data/client-version?platform=android&version=0.0.1");
await api("GET", "/game-servers");
await api("GET", "/maps");

const auth = await api("POST", "/auth/register", { email, password: "123456", ...client });
await api("GET", "/auth/me", undefined, auth.token);

// Login khách: cùng IP → cùng tài khoản.
const guest = await api("POST", "/auth/guest/login", client);
const guestAgain = await api("POST", "/auth/guest/login", client);
if (guest.userId !== guestAgain.userId) throw new Error("guest login must map the same IP to the same user");
await api("PUT", "/players/me/name", { name: `Smoke${Date.now() % 100000}` }, auth.playerToken);

const sdk = new Client(SERVER_URL);
sdk.auth.token = auth.playerToken;
const room = await sdk.joinOrCreate("world", { mapCode: auth.player.mapCode });
console.info(`✅ joined world room ${room.roomId} (map ${auth.player.mapCode})`);

await sleep(300);
const startX = (room.state as any).players.get(room.sessionId).x;
// Colyseus Netcode: gửi 1 input mỗi fixed step (20Hz) trong ~1s.
const input = room.input<{ moveX: number; moveY: number }>({ mode: "reliable" });
for (let i = 0; i < 20; i++) {
    input.data.moveX = 1;
    input.data.moveY = 0;
    input.send();
    await sleep(50);
}
await sleep(200);
const moved = (room.state as any).players.get(room.sessionId);
console.info(`✅ moved x: ${startX} → ${moved.x.toFixed(2)} (direction ${moved.direction})`);
if (!(moved.x > startX)) throw new Error("Player did not move");

await room.leave();
await sleep(500);
const saved = await api("GET", "/players/me", undefined, auth.playerToken);
console.info(`✅ saved position x=${saved.x.toFixed(2)} y=${saved.y}`);
if (Math.abs(saved.x - moved.x) > 0.01) throw new Error("Position was not saved");

console.info("🎉 Smoke test passed");
process.exit(0);
