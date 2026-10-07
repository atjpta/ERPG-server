/**
 * Smoke test end-to-end: đăng ký → tạo nhân vật → join room `world` → di chuyển → lưu vị trí.
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

await api("GET", "/game-servers");
await api("GET", "/maps");

const registered = await api("POST", "/auth/register", { email, password: "123456", ...client });
await api("GET", "/auth/me", undefined, registered.token);
if (registered.player !== null || registered.playerToken !== null) {
    throw new Error("new account must not have a player before POST /players");
}
const starterClasses = await api<{ code: string }[]>("GET", "/classes/starter");
const auth = await api(
    "POST",
    "/players",
    { name: `Smoke${Date.now() % 100000}`, classCode: starterClasses[0].code },
    registered.token
);
if (!Object.values(auth.player.equipments).every(Boolean)) {
    throw new Error("new player must wear the full starter equipment");
}

// Login khách: cùng IP → cùng tài khoản.
const guest = await api("POST", "/auth/guest/login", client);
const guestAgain = await api("POST", "/auth/guest/login", client);
if (guest.userId !== guestAgain.userId)
    throw new Error("guest login must map the same IP to the same user");
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

// ---- NPC, thoại, quest, vật thể ---------------------------------------------------------------
// Chỉ chạy khi map hiện tại có NPC `village_chief` (town_01).
const content = await api("GET", `/maps/${auth.player.mapCode}/content`);
if (!content.contentHash) throw new Error("map content must carry contentHash");
if (content.npcs.some((npc: { npcCode: string }) => npc.npcCode === "village_chief")) {
    const chief = content.npcs.find((npc: { npcCode: string }) => npc.npcCode === "village_chief");
    const waitFor = <T>(type: string) =>
        new Promise<T>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`timeout waiting for "${type}"`)),
                3000
            );
            room.onMessage(type, (message: T) => {
                clearTimeout(timer);
                resolve(message);
            });
        });

    // Đứng xa NPC / portal thì bị từ chối.
    const far = waitFor<{ ok: boolean; error?: string }>("interactResult");
    room.send("interact", { id: "south_gate" });
    if ((await far).ok) throw new Error("portal must reject a player standing far away");
    console.info("✅ interact far portal rejected");

    // Đi tới sát Trưởng làng — từ vị trí hiện tại, lái từng step theo vị trí server.
    const me = (room.state as any).players.get(room.sessionId);
    for (let i = 0; i < 200 && Math.hypot(me.x - chief.x, me.y - (chief.y + 1)) > 0.5; i++) {
        input.data.moveX = Math.sign(chief.x - me.x) * (Math.abs(chief.x - me.x) > 0.3 ? 1 : 0);
        input.data.moveY =
            Math.sign(chief.y + 1 - me.y) * (Math.abs(chief.y + 1 - me.y) > 0.3 ? 1 : 0);
        input.send();
        await sleep(50);
    }
    input.data.moveX = 0;
    input.data.moveY = 0;
    input.send();
    await sleep(300);
    console.info(`✅ walked next to the village chief at (${me.x.toFixed(2)}, ${me.y.toFixed(2)})`);

    const offer = waitFor<{ nodeId: string; options: { id: string }[] }>("dialogue");
    room.send("interactNpc", { npcCode: "village_chief" });
    const first = await offer;
    if (first.nodeId !== "start" || !first.options.some((o) => o.id === "accept")) {
        throw new Error(`unexpected first dialogue node ${JSON.stringify(first)}`);
    }
    console.info("✅ village chief offers the quest");

    const updated = waitFor<{ quest: { code: string; state: string } }>("questUpdate");
    room.send("dialogueChoose", { optionId: "accept" });
    const { quest } = await updated;
    if (quest.code !== "slime_hunt" || quest.state !== "active") {
        throw new Error(`quest not accepted: ${JSON.stringify(quest)}`);
    }
    console.info("✅ quest accepted via dialogue");

    // Option bịa → server đóng thoại và báo lỗi, không chạy gì.
    const ended = waitFor<{ error?: string }>("dialogueEnd");
    room.send("dialogueChoose", { optionId: "does_not_exist" });
    if (!(await ended).error) throw new Error("unknown dialogue option must be rejected");
    console.info("✅ unknown dialogue option rejected");
}

await room.leave();
await sleep(500);
const saved = await api("GET", "/players/me", undefined, auth.playerToken);
console.info(`✅ saved position x=${saved.x.toFixed(2)} y=${saved.y}`);
if (Math.abs(saved.x - moved.x) > 0.01) throw new Error("Position was not saved");

console.info("🎉 Smoke test passed");
process.exit(0);
