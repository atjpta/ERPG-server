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
    const json = (await res.json()) as {
        success: boolean;
        data: T;
        message: string;
        code: string | null;
    };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    console.info(`✅ ${method} ${path} → ${res.status}`);
    return json.data;
}

/** Envelope chung của mọi message room (xem `src/core/types/result.type.ts`). */
interface RoomResult<T> {
    success: boolean;
    data: T;
    code: string | null;
    message: string;
    error: unknown;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const client = { platform: "android", clientVersion: "0.0.1", device: "smoke-test" };
const email = `smoke_${Date.now()}@erpg.local`;

await api("GET", "/user/game-servers");
await api("GET", "/user/maps");

const registered = await api("POST", "/user/auth/register", {
    email,
    password: "123456",
    ...client,
});
await api("GET", "/user/auth/me", undefined, registered.token);
if (registered.player !== null || registered.playerToken !== null) {
    throw new Error("new account must not have a player before POST /user/players");
}
const starterClasses = await api<{ code: string }[]>("GET", "/user/classes/starter");
const auth = await api(
    "POST",
    "/user/players",
    { name: `Smoke${Date.now() % 100000}`, classCode: starterClasses[0].code },
    registered.token
);
if (!Object.values(auth.player.equipments).every(Boolean)) {
    throw new Error("new player must wear the full starter equipment");
}

// Login khách: cùng IP → cùng tài khoản.
const guest = await api("POST", "/user/auth/guest/login", client);
const guestAgain = await api("POST", "/user/auth/guest/login", client);
if (guest.userId !== guestAgain.userId)
    throw new Error("guest login must map the same IP to the same user");
await api(
    "PUT",
    "/user/players/me/name",
    { name: `Smoke${Date.now() % 100000}` },
    auth.playerToken
);

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
// Chỉ chạy khi map hiện tại có NPC `village_chief` (greenfield_village).
const content = await api("GET", `/user/maps/${auth.player.mapCode}/content`);
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
    const far = waitFor<RoomResult<{ id: string }>>("interactResult");
    room.send("interact", { id: "south_gate" });
    if ((await far).success) throw new Error("portal must reject a player standing far away");
    console.info("✅ interact far portal rejected");

    // Đi tới sát Trưởng làng — từ vị trí hiện tại, lái từng step theo vị trí server.
    const me = (room.state as any).players.get(room.sessionId);
    for (let i = 0; i < 200 && Math.hypot(me.x - chief.x, me.y - (chief.y - 1)) > 0.5; i++) {
        input.data.moveX = Math.sign(chief.x - me.x) * (Math.abs(chief.x - me.x) > 0.3 ? 1 : 0);
        input.data.moveY =
            Math.sign(chief.y - 1 - me.y) * (Math.abs(chief.y - 1 - me.y) > 0.3 ? 1 : 0);
        input.send();
        await sleep(50);
    }
    input.data.moveX = 0;
    input.data.moveY = 0;
    input.send();
    await sleep(300);
    console.info(`✅ walked next to the village chief at (${me.x.toFixed(2)}, ${me.y.toFixed(2)})`);

    const offer = waitFor<RoomResult<{ nodeId: string; options: { id: string }[] }>>("dialogue");
    room.send("interactNpc", { npcCode: "village_chief" });
    const first = (await offer).data;
    if (first.nodeId !== "start" || !first.options.some((o) => o.id === "accept")) {
        throw new Error(`unexpected first dialogue node ${JSON.stringify(first)}`);
    }
    console.info("✅ village chief offers the quest");

    const updated = waitFor<RoomResult<{ quest: { code: string; state: string } }>>("questUpdate");
    room.send("dialogueChoose", { optionId: "accept" });
    const { quest } = (await updated).data;
    if (quest.code !== "adventurer_registration" || quest.state !== "active") {
        throw new Error(`quest not accepted: ${JSON.stringify(quest)}`);
    }
    console.info("✅ quest accepted via dialogue");

    // Option bịa → server đóng thoại và báo lỗi, không chạy gì.
    const ended = waitFor<RoomResult<{ sourceCode: string }>>("dialogueEnd");
    room.send("dialogueChoose", { optionId: "does_not_exist" });
    if ((await ended).success) throw new Error("unknown dialogue option must be rejected");
    console.info("✅ unknown dialogue option rejected");
}

// ---- Party: tạo, mời, vào, rời, offline là rời ---------------------------------------------------
{
    const until = async (check: () => boolean, label: string, ms = 4000) => {
        const end = Date.now() + ms;
        while (Date.now() < end) {
            if (check()) return;
            await sleep(50);
        }
        throw new Error(`timeout waiting for ${label}`);
    };
    const once = <T>(target: any, type: string) =>
        new Promise<T>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error(`timeout waiting for "${type}"`)),
                4000
            );
            target.onMessage(type, (message: T) => {
                clearTimeout(timer);
                resolve(message);
            });
        });

    // Người chơi thứ hai: tài khoản + nhân vật + world room cùng map.
    const email2 = `smoke2_${Date.now()}@erpg.local`;
    const reg2 = await api("POST", "/user/auth/register", {
        email: email2,
        password: "123456",
        ...client,
    });
    const name2 = `Smk${Date.now() % 100000}`;
    const created2 = await api(
        "POST",
        "/user/players",
        { name: name2, classCode: starterClasses[0].code },
        reg2.token
    );
    const sdk2 = new Client(SERVER_URL);
    sdk2.auth.token = created2.playerToken;
    const world2 = await sdk2.joinOrCreate("world", { mapCode: created2.player.mapCode });
    await sleep(500);

    // Người 1 tạo party rồi join party room.
    const created = once<RoomResult<{ roomId: string }>>(room, "party");
    room.send("partyCreate");
    const { roomId: partyId } = (await created).data;
    const party1 = await sdk.joinById(partyId);
    await until(() => (party1.state as any).members?.size === 1, "party with 1 member");
    console.info("✅ party created, leader joined the party room");

    // Mời người 2: nhận lời mời ở world room, chấp nhận bằng joinById.
    const invited = once<RoomResult<{ partyRoomId: string }>>(world2, "partyInviteReceived");
    party1.send("invite", { playerName: name2 });
    const invite = (await invited).data;
    const party2 = await sdk2.joinById(invite.partyRoomId);
    await until(() => (party1.state as any).members.size === 2, "2 members");
    console.info("✅ invite accepted, party has 2 members");

    // Người 2 tự rời → còn 1 người.
    party2.send("leave");
    await until(() => (party1.state as any).members.size === 1, "member left");
    console.info("✅ member left the party");

    // Mời lại, vào lại; rồi người 2 thoát game (rời world room) → bị loại khỏi party ngay.
    const invitedAgain = once<RoomResult<{ partyRoomId: string }>>(world2, "partyInviteReceived");
    party1.send("invite", { playerName: name2 });
    const second = (await invitedAgain).data;
    await sdk2.joinById(second.partyRoomId);
    await until(() => (party1.state as any).members.size === 2, "2 members again");
    await world2.leave();
    await until(() => (party1.state as any).members.size === 1, "offline member removed");
    console.info("✅ going offline leaves the party immediately");
    await party1.leave();
}

await room.leave();
await sleep(500);
const saved = await api("GET", "/user/players/me", undefined, auth.playerToken);
console.info(`✅ saved position x=${saved.x.toFixed(2)} y=${saved.y}`);
if (Math.abs(saved.x - moved.x) > 0.01) throw new Error("Position was not saved");

console.info("🎉 Smoke test passed");
process.exit(0);
