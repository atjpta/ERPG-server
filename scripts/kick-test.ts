/**
 * Test đá player khỏi room realtime (cần server đang chạy + DB đã seed):
 * đăng nhập trùng (cùng room và khác room), ban player, logout, xoá tài khoản.
 * Chạy: `yarn kick-test` (mặc định http://localhost:2567, đổi bằng env SERVER_URL).
 */
import { Client, type Room } from "@colyseus/sdk";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:2567";
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@gmail.com", password: "123456" };
const CLIENT = { platform: "android", clientVersion: "0.0.1", device: "kick-test" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api<T = any>(method: string, path: string, body?: unknown, token?: string) {
    const res = await fetch(`${SERVER_URL}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as { data: T };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json.data;
}

/** Đăng ký + tạo nhân vật → `{ token, playerToken, player, ... }`. */
async function register() {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const email = `kick_${suffix}@erpg.local`;
    const registered = await api("POST", "/auth/register", {
        email,
        password: "123456",
        ...CLIENT,
    });
    const created = await api(
        "POST",
        "/players",
        { name: `Kick${suffix.slice(-8)}`, classCode: "swordman" },
        registered.token
    );
    return { ...registered, ...created };
}

/** `forceNewRoom` = `create` thay vì `joinOrCreate` → chắc chắn vào room (kênh) khác. */
async function join(playerToken: string, mapCode: string, forceNewRoom = false) {
    const sdk = new Client(SERVER_URL);
    sdk.auth.token = playerToken;
    const room = forceNewRoom
        ? await sdk.create("world", { mapCode })
        : await sdk.joinOrCreate("world", { mapCode });
    const left = new Promise<number>((resolve) => room.onLeave((code) => resolve(code)));
    return { room, left };
}

/** Chờ room bị đá với đúng close code (timeout = fail). */
async function expectKicked(name: string, left: Promise<number>, code: number) {
    const result = await Promise.race([left, sleep(3000).then(() => -1)]);
    if (result !== code) throw new Error(`${name}: expected close ${code}, got ${result}`);
    console.info(`✅ ${name} → close ${code}`);
}

async function expectStillConnected(name: string, room: Room) {
    await sleep(300);
    if (!room.connection.isOpen) throw new Error(`${name}: connection closed unexpectedly`);
    console.info(`✅ ${name} → vẫn kết nối`);
}

const adminToken = (await api("POST", "/admin/auth/login", ADMIN)).token;

// 1. Đăng nhập trùng trong cùng room.
{
    const auth = await register();
    const a = await join(auth.playerToken, auth.player.mapCode);
    const b = await join(auth.playerToken, auth.player.mapCode);
    await expectKicked("Trùng login cùng room: kết nối cũ", a.left, 4001);
    await expectStillConnected("Trùng login cùng room: kết nối mới", b.room);

    // 2. Ban player → đá kết nối đang chơi.
    await api("POST", `/admin/players/${auth.player.id}/ban`, { reason: "test" }, adminToken);
    await expectKicked("Admin ban player", b.left, 4002);
}

// 3. Đăng nhập trùng ở 2 room khác nhau (2 kênh của cùng map) — đi qua presence.
{
    const auth = await register();
    const a = await join(auth.playerToken, auth.player.mapCode);
    const b = await join(auth.playerToken, auth.player.mapCode, true);
    if (a.room.roomId === b.room.roomId) throw new Error("Expected 2 different rooms");
    await expectKicked("Trùng login khác room: kết nối cũ", a.left, 4001);
    await expectStillConnected("Trùng login khác room: kết nối mới", b.room);
    await b.room.leave();
}

// 4. Logout → đá kết nối của session đó.
{
    const auth = await register();
    const a = await join(auth.playerToken, auth.player.mapCode);
    await api("POST", "/auth/logout", {}, auth.token);
    await expectKicked("Logout", a.left, 4004);
}

// 5. Xoá tài khoản trong app.
{
    const auth = await register();
    const a = await join(auth.playerToken, auth.player.mapCode);
    await api("DELETE", "/auth/account", {}, auth.token);
    await expectKicked("Xoá tài khoản", a.left, 4003);
}

console.info("🎉 Kick test passed");
process.exit(0);
