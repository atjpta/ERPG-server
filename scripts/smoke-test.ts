/**
 * Smoke test end-to-end: đăng ký → tạo nhân vật → join room `world` + `global` → di chuyển → request/response
 * (world, chat, party) → lưu vị trí. Mọi thao tác hỏi-đáp dùng `room.request` (Colyseus Request/Response),
 * response luôn là envelope `Result`; push (`dialogue`, `chatReceived`, `partyState`...) thu bằng `inbox`.
 * Chạy khi server đang bật: `yarn smoke` (mặc định http://localhost:2567, đổi bằng env SERVER_URL).
 */
import { execSync } from "node:child_process";
import { Client, type Room } from "@colyseus/sdk";

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

/** Envelope chung của mọi response / push của room (xem `src/core/types/result.type.ts`). */
interface RoomResult<T> {
    success: boolean;
    data: T;
    code: string | null;
    message: string;
    error: unknown;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gửi request và nhận envelope `Result` (response của handler). Lỗi giao thức (không có handler...) thì reject. */
const request = <T = unknown>(target: Room, type: string, payload?: unknown, timeout = 5000) =>
    (target as Room<any>).request<unknown, RoomResult<T>>(type as never, payload, { timeout });

const until = async (check: () => boolean, label: string, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (check()) return;
        await sleep(50);
    }
    throw new Error(`timeout waiting for ${label}`);
};

/** SDK cảnh báo mỗi push không có handler; smoke test chỉ quan tâm một vài loại nên nhận hết bằng `*`. */
const silenced = new WeakSet<Room>();
const silence = (target: Room) => {
    if (silenced.has(target)) return;
    silenced.add(target);
    target.onMessage("*", () => {});
};

/** Thu mọi push `type` (server tự đẩy xuống, không phải response) vào một mảng sống. */
const inbox = <T>(target: Room, type: string) => {
    const list: RoomResult<T>[] = [];
    silence(target);
    target.onMessage(type, (message: RoomResult<T>) => list.push(message));
    return list;
};

interface BagEntry {
    id: string;
    itemId: string;
}

/**
 * Túi equipment của một room global từ các push `inventoryChanged` (chi tiết thay đổi, không phải cả túi): ô thêm / đổi theo `id`, ô mất bị bỏ.
 * `pushes` đếm số lần túi đổi. Chỉ biết các ô đã đổi kể từ lúc đăng ký (bản đầy đủ gửi một lần lúc vào room).
 */
const trackBag = (target: Room) => {
    const entries = new Map<string, BagEntry>();
    const bag = {
        pushes: 0,
        entries: () => [...entries.values()],
    };
    silence(target);
    target.onMessage(
        "inventoryChanged",
        (message: RoomResult<{ upserted: BagEntry[] & { type: string }[]; removed: string[] }>) => {
            for (const entry of message.data.upserted as (BagEntry & { type: string })[]) {
                if (entry.type === "equipment") entries.set(entry.id, entry);
            }
            for (const id of message.data.removed) entries.delete(id);
            bag.pushes++;
        }
    );
    return bag;
};

const expectOk = <T>(result: RoomResult<T>, label: string) => {
    if (!result.success) throw new Error(`${label}: expected success, got ${result.code}`);
    return result.data;
};

const expectCode = (result: RoomResult<unknown>, code: string, label: string) => {
    if (result.success || result.code !== code)
        throw new Error(`${label}: expected ${code}, got ${JSON.stringify(result)}`);
};

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

const serverId = auth.player.serverId as string;
const sdk = new Client(SERVER_URL);
sdk.auth.token = auth.playerToken;

// ---- serverId bắt buộc và phải khớp token: join sai bị từ chối (world lẫn global) ------------------
{
    const wrong = "00000000-0000-0000-0000-000000000000";
    const attempts: [string, string, Record<string, unknown>][] = [
        ["world sai serverId", "world", { serverId: wrong, mapCode: auth.player.mapCode }],
        ["world thiếu serverId", "world", { mapCode: auth.player.mapCode }],
        ["global sai serverId", "global", { serverId: wrong }],
        ["global thiếu serverId", "global", {}],
    ];
    for (const [label, name, options] of attempts) {
        const joined = await sdk.joinOrCreate(name, options).then(
            (r) => (r.leave(), true),
            () => false
        );
        if (joined) throw new Error(`${label}: join must be rejected`);
        console.info(`✅ ${label} bị từ chối`);
    }
    const servers = await api<{ id: string }[]>("GET", "/user/game-servers");
    if (servers.length < 2)
        console.info(
            "ℹ️  chỉ có 1 game server: bỏ qua kiểm tra hai serverId không chung kênh world"
        );
}

const room = await sdk.joinOrCreate("world", { serverId, mapCode: auth.player.mapCode });
silence(room);
console.info(`✅ joined world room ${room.roomId} (map ${auth.player.mapCode})`);
const global1 = await sdk.joinOrCreate("global", { serverId });
silence(global1);
console.info(`✅ joined global room ${global1.roomId}`);

await sleep(300);
const startX = (room.state as any).players.get(auth.player.id).x;
// Colyseus Netcode: gửi 1 input mỗi fixed step (20Hz) trong ~1s. Input không đi qua request/response.
const input = room.input<{ moveX: number; moveY: number }>({ mode: "reliable" });
for (let i = 0; i < 20; i++) {
    input.data.moveX = 1;
    input.data.moveY = 0;
    input.send();
    await sleep(50);
}
await sleep(200);
const moved = (room.state as any).players.get(auth.player.id);
console.info(`✅ moved x: ${startX} → ${moved.x.toFixed(2)} (direction ${moved.direction})`);
if (!(moved.x > startX)) throw new Error("Player did not move");

// ---- Request/Response cơ bản trên world (+ PlayerData ở global) -------------------------------------------------------------
{
    // Payload đúng → response là envelope Result.
    const attributes = await request(global1, "previewAttributes", { strength: 0 });
    if (typeof attributes.success !== "boolean" || !("code" in attributes))
        throw new Error(`response must be a Result envelope: ${JSON.stringify(attributes)}`);
    console.info(`✅ request previewAttributes → ${attributes.success ? "ok" : attributes.code}`);

    // PlayerData do global làm chủ: tháo / mặc lại đồ → global đẩy `inventory` + `attributes`, world cập nhật stats.
    const inventories = trackBag(global1);
    const attributePushes = inbox(global1, "attributes");
    const slot = Object.keys(auth.player.equipments)[0];
    const worn = auth.player.equipments[slot] as { itemId: string };
    expectOk(await request(global1, "unequipItem", { slot }), "unequipItem");
    await until(() => inventories.pushes > 0 && attributePushes.length > 0, "inventory push");
    const unequipped = inventories.entries().find((entry) => entry.itemId === worn.itemId);
    if (!unequipped) throw new Error("unequipped item must be in the bag");
    expectOk(await request(global1, "equipItem", { instanceId: unequipped.id }), "equipItem");
    console.info("✅ global unequip/equip → inventoryChanged + attributes pushed");

    // Payload sai → INVALID_INPUT (không im lặng, không bị kick).
    expectCode(await request(room, "interact", { nope: 1 }), "INVALID_INPUT", "invalid payload");
    expectCode(await request(room, "interact"), "INVALID_INPUT", "missing payload");
    console.info("✅ invalid payload → INVALID_INPUT");

    // Message không có handler → server trả lỗi giao thức, promise reject (không phải Result).
    const rejected = await request(room, "noSuchMessage", {}).then(
        () => false,
        (error: Error) => {
            console.info(`✅ unknown message rejected (${error.name}: ${error.message})`);
            return true;
        }
    );
    if (!rejected) throw new Error("unknown message must be rejected");
    if (!room.connection.isOpen) throw new Error("unknown message must not close the connection");
}

// ---- NPC, thoại, quest, vật thể ---------------------------------------------------------------
// Chỉ chạy khi map hiện tại có NPC `village_chief` (greenfield_village).
const content = await api("GET", `/user/maps/${auth.player.mapCode}/content`);
if (!content.contentHash) throw new Error("map content must carry contentHash");
if (content.npcs.some((npc: { npcCode: string }) => npc.npcCode === "village_chief")) {
    const chief = content.npcs.find((npc: { npcCode: string }) => npc.npcCode === "village_chief");
    const dialogues = inbox<{ nodeId: string; options: { id: string }[] }>(room, "dialogue");
    const questUpdates = inbox<{ quest: { code: string; state: string } }>(room, "questUpdate");

    // Đứng xa NPC / portal thì bị từ chối (response là Result thất bại).
    const far = await request(room, "interact", { id: "south_gate" });
    if (far.success) throw new Error("portal must reject a player standing far away");
    console.info(`✅ interact far portal rejected (${far.code})`);

    // Đi tới sát Trưởng làng — từ vị trí hiện tại, lái từng step theo vị trí server.
    const me = (room.state as any).players.get(auth.player.id);
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

    // Response chỉ báo mở được thoại; node đầu đến qua push `dialogue`.
    expectOk(await request(room, "interactNpc", { npcCode: "village_chief" }), "interactNpc");
    await until(() => dialogues.length > 0, "dialogue push");
    const first = dialogues[0].data;
    if (first.nodeId !== "start" || !first.options.some((o) => o.id === "accept")) {
        throw new Error(`unexpected first dialogue node ${JSON.stringify(first)}`);
    }
    console.info("✅ village chief offers the quest");

    expectOk(await request(room, "dialogueChoose", { optionId: "accept" }), "dialogueChoose");
    await until(() => questUpdates.length > 0, "questUpdate push");
    const { quest } = questUpdates[0].data;
    if (quest.code !== "adventurer_registration" || quest.state !== "active") {
        throw new Error(`quest not accepted: ${JSON.stringify(quest)}`);
    }
    console.info("✅ quest accepted via dialogue");

    // Option bịa → response thất bại, phiên thoại đóng, không chạy gì.
    const unknown = await request(room, "dialogueChoose", { optionId: "does_not_exist" });
    if (unknown.success) throw new Error("unknown dialogue option must be rejected");
    console.info(`✅ unknown dialogue option rejected (${unknown.code})`);
}

// ---- Người chơi thứ hai: tài khoản + nhân vật + world + global cùng server ---------------------------
const reg2 = await api("POST", "/user/auth/register", {
    email: `smoke2_${Date.now()}@erpg.local`,
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
const world2 = await sdk2.joinOrCreate("world", { serverId, mapCode: created2.player.mapCode });
const global2 = await sdk2.joinOrCreate("global", { serverId });
silence(world2);
silence(global2);
if (global1.roomId !== global2.roomId) throw new Error("same server must share one global room");
await sleep(500); // chờ world báo presence lên global

// ---- Chat (global): world / general / party / whisper, giới hạn, lịch sử ------------------------------
{
    interface Received {
        id: string;
        channel: string;
        senderName: string;
        content: string;
    }
    interface History {
        channel: string;
        messages: Received[];
        hasMore: boolean;
    }
    const got1 = inbox<Received>(global1, "chatReceived");
    const got2 = inbox<Received>(global2, "chatReceived");

    expectOk(await request(global1, "sendWorld", { content: "  hello world  " }), "sendWorld");
    await until(() => got1.length === 1 && got2.length === 1, "world message to both");
    if (got2[0].data.channel !== "world" || got2[0].data.content !== "hello world")
        throw new Error(`unexpected world message ${JSON.stringify(got2[0])}`);
    console.info("✅ chat world delivered (trimmed) to both players via global");

    expectOk(await request(global1, "sendGeneral", { content: "local" }), "sendGeneral");
    await until(() => got2.some((m) => m.data.channel === "general"), "general message");
    console.info("✅ chat general delivered (same map)");

    expectOk(
        await request(global1, "sendWhisper", { targetName: name2, content: "psst" }),
        "sendWhisper"
    );
    await until(
        () =>
            got1.some((m) => m.data.channel === "whisper") &&
            got2.some((m) => m.data.channel === "whisper"),
        "whisper to target + echo"
    );
    expectCode(
        await request(global1, "sendWhisper", { targetName: "NoSuchPlayerXyz", content: "x" }),
        "CHAT_TARGET_NOT_FOUND",
        "whisper to unknown"
    );
    expectCode(
        await request(global1, "sendParty", { content: "no party yet" }),
        "CHAT_NOT_IN_PARTY",
        "party chat without party"
    );
    expectCode(await request(global1, "sendWorld", { content: "   " }), "CHAT_EMPTY", "empty");
    expectCode(
        await request(global1, "sendWorld", { content: "x".repeat(300) }),
        "CHAT_TOO_LONG",
        "too long"
    );
    expectCode(
        await request(global1, "sendWorld", { nope: 1 }),
        "INVALID_INPUT",
        "invalid payload"
    );
    const spam = await Promise.all(
        Array.from({ length: 8 }, (_, i) => request(global1, "sendWorld", { content: `spam ${i}` }))
    );
    if (!spam.some((r) => r.code === "TOO_MANY_REQUESTS")) throw new Error("rate limit expected");
    console.info("✅ chat whisper / empty / too long / invalid / rate limit via response codes");

    // Lịch sử: world có lưu DB, general/party không; loadmore bằng con trỏ uuid v7.
    const history = expectOk(
        await request<History>(global2, "getHistory", { channel: "world" }),
        "getHistory"
    );
    if (!history.messages.some((m) => m.content === "hello world"))
        throw new Error("world history must contain persisted message");
    const ids = history.messages.map((m) => m.id);
    if (ids.length < 3) throw new Error("need >= 3 world messages for loadmore");
    if (ids.some((id, i) => i > 0 && id <= ids[i - 1]))
        throw new Error("history must be ordered old → new by uuid v7 id");
    const older = expectOk(
        await request<History>(global2, "getHistory", { channel: "world", before: ids[2] }),
        "loadmore"
    );
    if (older.messages.map((m) => m.id).join() !== ids.slice(0, 2).join() || older.hasMore)
        throw new Error("loadmore before ids[2] must return exactly the 2 older messages");
    const none = expectOk(
        await request<History>(global2, "getHistory", { channel: "world", before: ids[0] }),
        "loadmore oldest"
    );
    if (none.messages.length !== 0 || none.hasMore)
        throw new Error("loadmore before the oldest message must be empty");
    const general = await request<History>(global2, "getHistory", { channel: "general" });
    if (general.success && general.data.messages.length > 0)
        throw new Error("general must not have history");
    console.info("✅ chat history + loadmore by uuid v7 cursor");
}

// ---- Friend (global): lời mời, chấp nhận, presence, xoá, chặn --------------------------------------
{
    interface FriendList {
        friends: { playerId: string; name: string; online: boolean }[];
        received: { playerId: string }[];
        sent: { playerId: string }[];
        blocked: { playerId: string }[];
    }
    // Tên đã đổi ở đầu file (PUT /user/players/me/name): lấy tên hiện tại.
    const name1 = (await api("GET", "/user/players/me", undefined, auth.playerToken))
        .name as string;
    const changes2 = inbox<{ change: string; playerId: string }>(global2, "friendChanged");
    const changes1 = inbox<{ change: string; playerId: string }>(global1, "friendChanged");

    expectCode(
        await request(global1, "friendRequest", { playerName: "NoSuchPlayerXyz" }),
        "FRIEND_TARGET_NOT_FOUND",
        "friend unknown target"
    );
    expectCode(
        await request(global1, "friendRequest", { playerName: name1 }),
        "FRIEND_SELF_TARGET",
        "friend self"
    );
    const sent = expectOk(
        await request<{ notice: string }>(global1, "friendRequest", { playerName: name2 }),
        "friendRequest"
    );
    if (sent.notice !== "request_sent") throw new Error(`unexpected notice ${sent.notice}`);
    expectCode(
        await request(global1, "friendRequest", { playerName: name2 }),
        "FRIEND_REQUEST_EXISTS",
        "friend duplicate request"
    );
    await until(
        () => changes2.some((m) => m.data.change === "request_received"),
        "request_received push"
    );
    const list2 = expectOk(await request<FriendList>(global2, "friendList"), "friendList");
    if (list2.received.length !== 1 || list2.received[0].playerId !== auth.player.id)
        throw new Error("receiver must list the pending request");

    expectOk(await request(global2, "friendAccept", { playerId: auth.player.id }), "friendAccept");
    await until(() => changes1.some((m) => m.data.change === "added"), "added push");
    const list1 = expectOk(await request<FriendList>(global1, "friendList"), "friendList 1");
    if (!list1.friends.some((f) => f.playerId === created2.player.id && f.online))
        throw new Error("friend must be listed online");
    expectCode(
        await request(global2, "friendAccept", { playerId: auth.player.id }),
        "FRIEND_NO_REQUEST",
        "friend accept twice"
    );
    console.info("✅ friend request → accept → both lists + push");

    // Chặn: xoá bạn, người bị chặn không mời party / nhắn riêng / kết bạn lại được.
    expectOk(await request(global1, "friendBlock", { playerName: name2 }), "friendBlock");
    await until(() => changes2.some((m) => m.data.change === "removed"), "removed push");
    expectCode(
        await request(global2, "friendRequest", { playerName: name1 }),
        "FRIEND_TARGET_NOT_FOUND",
        "blocked player request"
    );
    expectCode(
        await request(global2, "sendWhisper", { targetName: name1, content: "hi" }),
        "CHAT_TARGET_NOT_FOUND",
        "blocked player whisper"
    );
    expectCode(
        await request(global1, "friendRequest", { playerName: name2 }),
        "FRIEND_BLOCKED_BY_YOU",
        "request to blocked player"
    );
    expectOk(await request(global1, "friendUnblock", { playerId: created2.player.id }), "unblock");
    expectCode(
        await request(global1, "friendUnblock", { playerId: created2.player.id }),
        "FRIEND_NOT_BLOCKED",
        "unblock twice"
    );
    console.info("✅ friend block removes the tie and denies request / whisper");
}

// ---- Mail (global): thư người chơi, đính kèm, COD, thu hồi, thư hệ thống đa ngôn ngữ, broadcast, hết hạn ------
{
    interface MailItem {
        itemId: string;
        quantity: number;
    }
    interface MailReward {
        items: MailItem[];
        currency: { code: string; amount: number }[];
    }
    interface MailMsg {
        id: string;
        kind: string;
        subject: string;
        body: string;
        texts: { locale: string; subject: string; body: string }[];
        reward?: MailReward;
        cod?: { code: string; amount: number };
        read: boolean;
        claimed: boolean;
    }
    interface MailList {
        mails: MailMsg[];
        unreadCount: number;
    }
    /** Công cụ dev gửi mail hệ thống (chưa có API admin): chạy ở tiến trình riêng, cần DB đã seed. */
    const mailTool = (args: string) =>
        execSync(`yarn -s mail:tool ${args}`, { cwd: process.cwd(), stdio: "pipe" }).toString();

    const name1 = (await api("GET", "/user/players/me", undefined, auth.playerToken))
        .name as string;
    const received1 = inbox<{ mail: MailMsg }>(global1, "mailReceived");
    const received2 = inbox<{ mail: MailMsg; unreadCount: number }>(global2, "mailReceived");
    const removed2 = inbox<{ mailId: string }>(global2, "mailRemoved");
    const bag1 = trackBag(global1);
    const bag2 = trackBag(global2);
    const list = async (target: Room) =>
        expectOk(await request<MailList>(target, "mailList", {}), "mailList");
    const find = (mails: MailMsg[], pick: (mail: MailMsg) => boolean, label: string) => {
        const mail = mails.find(pick);
        if (!mail) throw new Error(`mail not found: ${label}`);
        return mail;
    };

    // Player 1 tháo vài món vào túi để có thứ đính kèm.
    const slots = Object.keys(auth.player.equipments).slice(0, 3);
    for (const slot of slots) {
        const before = bag1.pushes;
        expectOk(await request(global1, "unequipItem", { slot }), `unequip ${slot}`);
        await until(() => bag1.pushes > before, "inventory push");
    }
    const firstBagItem = () => bag1.entries()[0];
    const bagSize1 = () => bag1.entries().length;
    const startBag = bagSize1();

    // --- Gửi thư text: lỗi và thành công ---
    expectCode(
        await request(global1, "mailSend", { targetName: "NoSuchPlayerXyz", subject: "x" }),
        "MAIL_TARGET_NOT_FOUND",
        "mail unknown target"
    );
    expectCode(
        await request(global1, "mailSend", { targetName: name1, subject: "x" }),
        "MAIL_SELF_TARGET",
        "mail to self"
    );
    expectCode(
        await request(global1, "mailSend", { targetName: name2 }),
        "MAIL_EMPTY",
        "empty mail"
    );
    expectOk(
        await request(global1, "mailSend", { targetName: name2, subject: "hi", body: "hello" }),
        "mailSend text"
    );
    await until(() => received2.length === 1, "mailReceived push");
    const inbox2 = await list(global2);
    const text = find(inbox2.mails, (m) => m.subject === "hi", "text mail");
    if (text.kind !== "player" || text.read || inbox2.unreadCount < 1)
        throw new Error(`unexpected text mail ${JSON.stringify(text)}`);
    expectCode(
        await request(global2, "mailDelete", { mailId: text.id }),
        "MAIL_NOT_DELETABLE",
        "delete unread mail"
    );
    expectOk(await request(global2, "mailRead", { mailId: text.id }), "mailRead");
    expectOk(
        await request(global2, "mailDelete", { mailId: text.id }),
        "mailDelete read text mail"
    );
    console.info("✅ mail text: errors, push, list, read, delete");

    // --- Đính kèm item + thu hồi (người nhận chưa claim) ---
    const recallItem = firstBagItem();
    expectOk(
        await request(global1, "mailSend", {
            targetName: name2,
            subject: "gear",
            items: [{ instanceId: recallItem.id, quantity: 1 }],
        }),
        "mailSend item"
    );
    await until(() => bagSize1() === startBag - 1, "attached item leaves the sender's bag");
    const sent = expectOk(
        await request<{ mails: { id: string; subject: string }[] }>(global1, "mailSentList"),
        "mailSentList"
    );
    const sentGear = sent.mails.find((m) => m.subject === "gear");
    if (!sentGear) throw new Error("mailSentList must list the unclaimed mail");
    await until(() => received2.length === 2, "gear mail push");
    const gear2 = find((await list(global2)).mails, (m) => m.subject === "gear", "gear mail");
    expectOk(await request(global2, "mailRead", { mailId: gear2.id }), "mailRead gear"); // đã đọc vẫn thu hồi được
    expectOk(await request(global1, "mailRecall", { mailId: sentGear.id }), "mailRecall");
    await until(() => removed2.some((m) => m.data.mailId === gear2.id), "mailRemoved push");
    expectCode(
        await request(global1, "mailRecall", { mailId: sentGear.id }),
        "MAIL_NOT_FOUND",
        "recall twice"
    );
    await until(() => received1.length >= 1, "returned mail push");
    const returned = received1.at(-1)!.data.mail;
    if (returned.kind !== "system" || returned.reward?.items.length !== 1)
        throw new Error(`recall must return the attachment: ${JSON.stringify(returned)}`);
    expectOk(await request(global1, "mailClaim", { mailId: returned.id }), "claim returned mail");
    await until(() => bagSize1() === startBag, "returned item back in the bag");
    console.info("✅ mail item attach → recall (already read) → returned by system mail");

    // --- Người nhận claim; sau đó không thu hồi được ---
    const claimItem = firstBagItem();
    expectOk(
        await request(global1, "mailSend", {
            targetName: name2,
            subject: "gift",
            items: [{ instanceId: claimItem.id, quantity: 1 }],
        }),
        "mailSend gift"
    );
    const gift2 = find((await list(global2)).mails, (m) => m.subject === "gift", "gift mail");
    const bag2Before = bag2.pushes;
    expectOk(await request(global2, "mailClaim", { mailId: gift2.id }), "mailClaim");
    await until(() => bag2.pushes > bag2Before, "recipient inventory push");
    if (!bag2.entries().some((e) => e.itemId === claimItem.itemId))
        throw new Error("claimed item must be in the recipient's bag");
    expectCode(
        await request(global2, "mailClaim", { mailId: gift2.id }),
        "MAIL_ALREADY_CLAIMED",
        "claim twice"
    );
    const gift1 = expectOk(
        await request<{ mails: { id: string }[] }>(global1, "mailSentList"),
        "mailSentList after claim"
    );
    if (gift1.mails.length !== 0) throw new Error("claimed mails must leave the sent list");
    expectCode(
        await request(global1, "mailRecall", { mailId: gift2.id }),
        "MAIL_ALREADY_CLAIMED",
        "recall after claim"
    );
    expectOk(await request(global2, "mailDelete", { mailId: gift2.id }), "delete claimed mail");
    console.info("✅ mail item claimed by the recipient (no more recall)");

    // --- Thư hệ thống đa ngôn ngữ + tiền (công cụ dev gửi) ---
    mailTool(`gift ${name2} --gold 5000`);
    const viGift = find(
        (await list(global2)).mails,
        (m) => m.kind === "system" && !!m.reward?.currency.length,
        "gift"
    );
    // Server gửi mọi ngôn ngữ, client tự chọn: có cả vi và en với chữ khác nhau.
    const textOf = (locale: string) => viGift.texts.find((text) => text.locale === locale);
    if (!textOf("vi") || !textOf("en") || textOf("vi")!.subject === textOf("en")!.subject)
        throw new Error(`system mail must carry every locale: ${JSON.stringify(viGift.texts)}`);
    const claimedGift = expectOk(
        await request<{ currency: { code: string; amount: number }[] }>(global2, "mailClaim", {
            mailId: viGift.id,
        }),
        "claim gold gift"
    );
    if (claimedGift.currency[0]?.amount !== 5000) throw new Error("gift must grant 5000 gold");
    console.info("✅ system mail: every locale in texts, gold claimed (world wallet)");

    // --- COD: trả tiền mới lấy được đính kèm; tiền về người gửi bằng thư hệ thống ---
    const codItem = firstBagItem();
    expectOk(
        await request(global1, "mailSend", {
            targetName: name2,
            subject: "cod",
            items: [{ instanceId: codItem.id, quantity: 1 }],
            cod: { code: "gold", amount: 1000 },
        }),
        "mailSend cod"
    );
    const cod2 = find((await list(global2)).mails, (m) => m.subject === "cod", "cod mail");
    if (cod2.cod?.amount !== 1000) throw new Error("COD price must be listed");
    expectOk(await request(global2, "mailClaim", { mailId: cod2.id }), "claim cod mail");
    await until(
        () => received1.some((m) => m.data.mail.reward?.currency[0]?.amount === 1000),
        "cod payment mail"
    );
    const payment = received1.find((m) => m.data.mail.reward?.currency[0]?.amount === 1000)!;
    expectOk(
        await request(global1, "mailClaim", { mailId: payment.data.mail.id }),
        "claim payment"
    );
    console.info("✅ mail COD: recipient pays, sender (online) gets the money by system mail");

    // COD mà người nhận không đủ tiền; nhận hàng loạt bỏ qua COD; trả lại
    const priceyItem = firstBagItem();
    expectOk(
        await request(global1, "mailSend", {
            targetName: name2,
            subject: "pricey",
            items: [{ instanceId: priceyItem.id, quantity: 1 }],
            cod: { code: "gold", amount: 900_000_000 },
        }),
        "mailSend pricey cod"
    );
    const pricey = find((await list(global2)).mails, (m) => m.subject === "pricey", "pricey mail");
    expectCode(
        await request(global2, "mailClaim", { mailId: pricey.id }),
        "CURRENCY_NOT_ENOUGH",
        "claim cod without money"
    );
    const all = expectOk(
        await request<{ claimed: unknown[]; skippedCod: number }>(global2, "mailClaimAll"),
        "mailClaimAll"
    );
    if (all.skippedCod < 1) throw new Error("claimAll must skip COD mails");
    expectOk(await request(global2, "mailRead", { mailId: pricey.id }), "read pricey");
    expectCode(
        await request(global2, "mailDelete", { mailId: pricey.id }),
        "MAIL_NOT_DELETABLE",
        "delete unclaimed COD"
    );
    const returnedBefore = received1.length;
    expectOk(await request(global2, "mailReturn", { mailId: pricey.id }), "mailReturn");
    await until(() => received1.length > returnedBefore, "returned cod push");
    const backPricey = received1.at(-1)!.data.mail;
    expectOk(await request(global1, "mailClaim", { mailId: backPricey.id }), "claim returned cod");
    console.info("✅ mail COD: not enough money, claimAll skips it, return to sender");

    // --- Gem: đính kèm gem và COD bằng gem ---
    mailTool(`gift ${name1} --gem 100`);
    mailTool(`gift ${name2} --gem 100`);
    const hasGem = (mail: MailMsg) => !!mail.reward?.currency.some((c) => c.code === "gem");
    for (const [target, who] of [
        [global1, "p1"],
        [global2, "p2"],
    ] as const) {
        const gemGift = find(
            (await list(target)).mails,
            (m) => hasGem(m) && !m.claimed,
            `gem gift ${who}`
        );
        expectOk(
            await request(target, "mailClaim", { mailId: gemGift.id }),
            `claim gem gift ${who}`
        );
    }
    expectOk(
        await request(global1, "mailSend", {
            targetName: name2,
            subject: "gems",
            currency: [{ code: "gem", amount: 30 }],
            cod: { code: "gem", amount: 20 },
        }),
        "mailSend gem with gem COD"
    );
    const gems2 = find((await list(global2)).mails, (m) => m.subject === "gems", "gem mail");
    if (gems2.cod?.code !== "gem") throw new Error("COD must be priced in gem");
    const gemClaim = expectOk(
        await request<{ currency: { code: string; amount: number }[] }>(global2, "mailClaim", {
            mailId: gems2.id,
        }),
        "claim gem mail"
    );
    if (gemClaim.currency[0]?.code !== "gem" || gemClaim.currency[0].amount !== 30)
        throw new Error("the attached gems must be granted");
    await until(
        () =>
            received1.some((m) =>
                m.data.mail.reward?.currency.some((c) => c.code === "gem" && c.amount === 20)
            ),
        "gem cod payment mail"
    );
    console.info("✅ mail gem: attached gems + COD priced in gem");

    // --- Broadcast (1 ngày để không để lại rác lâu): phát đúng một lần, xoá thư xong không bị phát lại ---
    const broadcastGold = 1000 + (Date.now() % 9000); // số riêng để phân biệt với broadcast của các lần chạy trước
    mailTool(`broadcast --gold ${broadcastGold} --days 1`);
    const isMine = (m: MailMsg) => !!m.reward?.currency.some((c) => c.amount === broadcastGold);
    const first = await list(global1);
    const second = await list(global1);
    if (first.mails.filter(isMine).length !== 1)
        throw new Error("broadcast must reach the player exactly once");
    if (first.mails.length !== second.mails.length)
        throw new Error("a broadcast must be delivered only once per player");
    const broadcastMail = first.mails.find(isMine)!;
    expectOk(await request(global1, "mailClaim", { mailId: broadcastMail.id }), "claim broadcast");
    expectOk(
        await request(global1, "mailDelete", { mailId: broadcastMail.id }),
        "delete broadcast"
    );
    const afterDelete = await list(global1);
    if (afterDelete.mails.some(isMine))
        throw new Error("a deleted broadcast mail must not come back (receipt keeps it delivered)");
    console.info("✅ mail broadcast delivered once, and a deleted one does not come back");

    // --- Hết hạn: thư người chơi chưa nhận được trả đính kèm về người gửi ---
    const expiringItem = firstBagItem();
    expectOk(
        await request(global1, "mailSend", {
            targetName: name2,
            subject: "expiring",
            items: [{ instanceId: expiringItem.id, quantity: 1 }],
        }),
        "mailSend expiring"
    );
    mailTool(`expire ${name2}`);
    const after2 = await list(global2);
    if (after2.mails.some((m) => m.subject === "expiring"))
        throw new Error("expired mail must be gone");
    const back1 = await list(global1);
    if (!back1.mails.some((m) => m.kind === "system" && m.reward?.items.length === 1 && !m.claimed))
        throw new Error("expired mail must return its attachment to the sender");
    console.info("✅ mail expiry sweeps the mail and returns the attachment");
}

// ---- Gift code (global): nhập code → thư quà (push mailReceived) → nhận bằng mailClaim --------------------
{
    const giftTool = (args: string) =>
        execSync(`yarn -s mail:tool giftcode ${args}`, {
            cwd: process.cwd(),
            stdio: "pipe",
        }).toString();
    const code = `SMOKE${Date.now()}`;
    const received = inbox<{ mail: { id: string; reward?: { currency: { amount: number }[] } } }>(
        global1,
        "mailReceived"
    );
    expectCode(
        await request(global1, "giftCodeRedeem", { code: "NOSUCHCODE" }),
        "GIFT_CODE_NOT_FOUND",
        "gift code unknown"
    );
    giftTool(`create ${code} --gold 100 --max 5`);
    const before = received.length;
    const redeemed = expectOk(
        await request<{ mailId: string }>(global1, "giftCodeRedeem", { code: code.toLowerCase() }),
        "giftCodeRedeem"
    );
    await until(() => received.length > before, "mailReceived push for the gift code");
    if (received.at(-1)!.data.mail.id !== redeemed.mailId)
        throw new Error("gift code mail id must match the push");
    expectCode(
        await request(global1, "giftCodeRedeem", { code }),
        "GIFT_CODE_ALREADY_REDEEMED",
        "gift code twice"
    );
    expectOk(
        await request(global1, "mailClaim", { mailId: redeemed.mailId }),
        "claim gift code mail"
    );
    giftTool(`disable ${code}`);
    expectCode(
        await request(global2, "giftCodeRedeem", { code }),
        "GIFT_CODE_NOT_FOUND",
        "gift code disabled"
    );
    console.info("✅ gift code: redeem → mail → claim, once per character, disabled code refused");
}

// ---- Party (global): tạo, mời, vào, rời, offline là rời ---------------------------------------------
{
    interface PartyState {
        partyId: string;
        leaderPlayerId: string;
        members: { playerId: string; name: string }[];
    }
    const states1 = inbox<PartyState>(global1, "partyState");
    const invites2 = inbox<{ partyId: string }>(global2, "partyInviteReceived");
    const latestSize = () => states1.at(-1)?.data.members.length ?? 0;

    const party = expectOk(await request<PartyState>(global1, "partyCreate"), "partyCreate");
    if (party.members.length !== 1 || party.leaderPlayerId !== auth.player.id)
        throw new Error(`unexpected new party ${JSON.stringify(party)}`);
    console.info("✅ party created");

    // Mời người 2: lời mời đến qua push, chấp nhận bằng request.
    const invited = expectOk(
        await request<{ notice: string }>(global1, "partyInvite", { playerName: name2 }),
        "partyInvite"
    );
    if (invited.notice !== "invite_sent") throw new Error(`unexpected notice ${invited.notice}`);
    await until(() => invites2.length === 1, "invite push");
    const joined = expectOk(
        await request<PartyState>(global2, "partyAcceptInvite", {
            partyId: invites2[0].data.partyId,
        }),
        "partyAcceptInvite"
    );
    if (joined.members.length !== 2) throw new Error("accepted party must have 2 members");
    await until(() => latestSize() === 2, "leader receives 2-member partyState");
    console.info("✅ invite accepted, party has 2 members");

    // Hai người cùng map: partyId nằm trong state world nên đồng đội nhận ra nhau và đọc level / HP từ đó.
    await until(
        () =>
            (room.state as any).players.get(created2.player.id)?.partyId === joined.partyId &&
            (room.state as any).players.get(auth.player.id)?.partyId === joined.partyId,
        "partyId synced in world state"
    );
    console.info("✅ partyId synced to both members through world state");

    // Chat party giờ có người nhận.
    const partyChat = inbox<{ channel: string }>(global2, "chatReceived");
    expectOk(await request(global1, "sendParty", { content: "party hi" }), "sendParty");
    await until(() => partyChat.some((m) => m.data.channel === "party"), "party chat");
    console.info("✅ party chat delivered");

    // Đổi tên giữa phiên (PUT /user/players/me/name): world state, partyState và chat dùng tên mới ngay, không cần vào lại.
    const renamed2 = `Rn${Date.now() % 100000}`;
    const chatFrom2 = inbox<{ channel: string; senderName: string }>(global1, "chatReceived");
    await api("PUT", "/user/players/me/name", { name: renamed2 }, created2.playerToken);
    await until(
        () => (room.state as any).players.get(created2.player.id)?.name === renamed2,
        "world state shows the new name"
    );
    await until(
        () => states1.at(-1)?.data.members.some((member) => member.name === renamed2) ?? false,
        "partyState carries the new name"
    );
    expectOk(await request(global2, "sendParty", { content: "after rename" }), "sendParty renamed");
    await until(
        () => chatFrom2.some((m) => m.data.channel === "party" && m.data.senderName === renamed2),
        "chat uses the new name"
    );
    console.info("✅ rename during the session: world state, partyState and chat use the new name");

    // Người không phải chủ không đá được.
    expectCode(
        await request(global2, "partyKick", { playerId: auth.player.id }),
        "PARTY_NOT_LEADER",
        "non-leader kick"
    );

    // Người 2 tự rời → còn 1 người.
    expectOk(await request(global2, "partyLeave"), "partyLeave");
    await until(() => latestSize() === 1, "member left");
    console.info("✅ member left the party");

    // Mời lại, vào lại. Người 2 rời hẳn world room (thoát / mất kết nối) → ra khỏi party luôn;
    // đổi map thì giữ party (không test ở đây).
    expectOk(await request(global1, "partyInvite", { playerName: renamed2 }), "partyInvite again");
    await until(() => invites2.length === 2, "second invite push");
    expectOk(
        await request(global2, "partyAcceptInvite", { partyId: invites2[1].data.partyId }),
        "partyAcceptInvite again"
    );
    await until(() => latestSize() === 2, "2 members again");
    await world2.leave();
    await until(() => latestSize() === 1, "member leaving the world is removed from the party");
    console.info("✅ leaving the world room for good removes the member from the party");
    await global2.leave();
    await request(global1, "partyLeave"); // chủ cuối cùng rời = party tan
    await global1.leave();
}

await room.leave();
await sleep(500);
const saved = await api("GET", "/user/players/me", undefined, auth.playerToken);
console.info(`✅ saved position x=${saved.x.toFixed(2)} y=${saved.y}`);
if (Math.abs(saved.x - moved.x) > 0.01) throw new Error("Position was not saved");

console.info("🎉 Smoke test passed");
process.exit(0);
