import { DateTime } from "luxon";
import { Response } from "@/core/response/response.js";
import { QuestLogState } from "@/modules/quests/state/quest-log.state.js";
import { EquipmentInstanceState } from "@/modules/equipment/state/equipment-instance.state.js";
import type { InventoryItem } from "@/modules/player/schemas/inventory.schema.js";
import { InventoryState } from "@/modules/player/state/inventory.state.js";
import { ItemSource, ItemType } from "@/modules/items/enums/item.enum.js";
import { WalletState } from "@/modules/player/state/wallet.state.js";
import { createWallet } from "@/modules/player/schemas/wallet.schema.js";
import { CurrencyCode } from "@/modules/player/enums/wallet.enum.js";
import { PartyLootState } from "@/modules/rewards/state/party-loot.state.js";
import { DialogueSessionsState } from "@/modules/dialogues/state/dialogue-session.state.js";
import {
    DUNGEON_CROSS_GRACE_MS,
    DUNGEON_JOIN_GRACE_MS,
    DungeonInstanceState,
} from "@/modules/maps/state/dungeon-instance.state.js";
import { PendingSkillHitState } from "@/modules/combat/state/pending-skill-hit.state.js";
import { HitDelivery } from "@/modules/skills/enums/skill.enum.js";
import type { DungeonConfig } from "@/modules/maps/types/game-map.type.js";
import { check, checkEqual, test } from "./harness.js";

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const spawn = (count: number) => ({ monsterCode: "m", count }) as never;

const config: DungeonConfig = {
    maxLevel: 30,
    timeLimitSec: 600,
    chambers: [
        {
            id: "c1",
            bounds: rect(0, 0, 10, 10),
            entry: { x: 1, y: 1 },
            exitGate: rect(9, 4, 1, 2),
            phases: [
                { id: "p1", delaySec: 0, monsterSpawns: [spawn(2)] },
                { id: "p2", delaySec: 5, monsterSpawns: [spawn(3)] },
            ],
        },
        {
            id: "c2",
            bounds: rect(10, 0, 10, 10),
            entry: { x: 11, y: 1 },
            entryGate: rect(10, 4, 1, 2),
            phases: [{ id: "p3", delaySec: 0, monsterSpawns: [spawn(1)] }],
            isBoss: true,
        },
    ],
} as never;

const newInstance = (expected: string[] = []) =>
    new DungeonInstanceState<string>(config, "i1", expected, "leader");

test("dungeon: chờ đủ người của party rồi mới bắt đầu, hoặc hết thời gian chờ", async () => {
    const instance = newInstance(["a", "b"]);
    instance.registerJoin("a", 1000, () => "tally-a");
    check(!instance.readyToStart, "not ready with one of two");
    check(!instance.joinGraceExpired(1000 + DUNGEON_JOIN_GRACE_MS - 1), "grace not over");
    check(instance.joinGraceExpired(1000 + DUNGEON_JOIN_GRACE_MS), "grace over");
    instance.registerJoin("b", 2000, () => "tally-b");
    instance.registerJoin("b", 3000, () => "again");
    check(instance.readyToStart, "ready when everyone joined");
    checkEqual(instance.rewards.get("b"), "tally-b", "tally created once");
    checkEqual(instance.firstJoinAt, 1000, "first join time kept");
    instance.begin(5000);
    check(!instance.readyToStart, "no longer ready once started");
    checkEqual(newInstance([]).readyToStart, true, "no expectation starts at once");
});

test("dungeon: thời gian còn lại và phase theo chamber", async () => {
    const instance = newInstance();
    instance.begin(0);
    checkEqual(instance.timeLeftSec(100_000), 500, "time left");
    checkEqual(instance.timeLeftSec(900_000), 0, "never negative");
    instance.beginChamber(0, 0, 5);
    check(instance.isPhaseDue(0), "first phase due at once");
    checkEqual(instance.nextPhaseInSec(0), 1, "at least one second");
    instance.spawnedPhases = 1;
    check(!instance.isPhaseDue(4000), "second phase not due yet");
    checkEqual(instance.nextPhaseInSec(4000), 1, "ceil of the remaining time");
    check(instance.isPhaseDue(5000), "second phase due");
    instance.spawningPhase = true;
    check(!instance.isPhaseDue(6000), "no phase while one is spawning");
    instance.spawningPhase = false;
    instance.spawnedPhases = 2;
    checkEqual(instance.upcomingPhase, undefined, "no phase left");
    checkEqual(instance.monsterCounts(), { alive: 0, pending: 0, total: 5 }, "monster counts");
    check(instance.isChamberDone(0), "done when all phases spawned and nothing alive");
    check(!instance.isChamberDone(1), "not done while a monster lives");
});

test("dungeon: sang chamber kế, cổng và qua cổng", async () => {
    const instance = newInstance();
    instance.begin(0);
    instance.beginChamber(0, 0, 5);
    const map = { width: 40, height: 20, colliders: [rect(0, 0, 1, 20)] };
    checkEqual(instance.refreshBounds(map).length, 1, "exit gate blocks until cleared");
    instance.markChamberCleared();
    checkEqual(instance.refreshBounds(map).length, 0, "no gate once cleared");
    checkEqual(instance.bounds?.colliders?.length, 1, "only map colliders left");

    const next = instance.nextChamber!;
    check(!instance.hasPassedEntry(next, { x: 10.5, y: 5 }), "inside the gate is not past it");
    check(instance.hasPassedEntry(next, { x: 12, y: 5 }), "past the entry gate");
    check(!instance.hasPassedEntry(next, { x: 12, y: 15 }), "outside the chamber bounds");

    check(!instance.trackCrossing(1000, 0, 2), "nobody crossed");
    check(!instance.trackCrossing(2000, 1, 2), "one of two crossed: wait");
    checkEqual(instance.crossedAt, 2000, "first crossing remembered");
    check(instance.trackCrossing(2000 + DUNGEON_CROSS_GRACE_MS, 1, 2), "grace over: go");
    check(instance.trackCrossing(3000, 2, 2), "everyone crossed: go");
    instance.trackCrossing(4000, 0, 2);
    checkEqual(instance.crossedAt, null, "reset when nobody is across");

    instance.monsters = [{} as never];
    const previous = instance.beginChamber(1, 9000, 7);
    checkEqual(previous.length, 1, "previous monsters returned");
    checkEqual(
        [
            instance.chamberIndex,
            instance.spawnedPhases,
            instance.monsterLevel,
            instance.chamberCleared,
        ],
        [1, 0, 7, false],
        "chamber reset"
    );
    check(instance.chamber.isBoss === true && instance.nextChamber === undefined, "last chamber");
});

test("combat: hit chờ nổ đúng tick, nhóm hit không trúng một mục tiêu hai lần", async () => {
    const skill = {
        castTimeMs: 0,
        skillHitEvents: [
            { triggerTicks: 2, hitGroup: 1, delivery: HitDelivery.ALLIES, effects: [] },
            { triggerTicks: 4, hitGroup: 1, delivery: HitDelivery.ALLIES, effects: [] },
            { triggerTicks: 3, delivery: HitDelivery.AURA, effects: [] },
        ],
    } as never;
    const hits = PendingSkillHitState.schedule(skill, 7, "left" as never, 20);
    checkEqual(hits.length, 2, "aura event is not scheduled as a pending hit");
    check(hits[0].claimGroupHit("t1"), "first claim of the group");
    check(!hits[1].claimGroupHit("t1"), "same group, same target: refused");
    check(hits[1].claimGroupHit("t2"), "another target is fine");

    const fired: number[] = [];
    const first = hits[0].ticksUntilHit;
    for (let i = 0; i < first + 5; i++) {
        PendingSkillHitState.tickAll(hits, (hit) => fired.push(hit.eventIndex));
    }
    checkEqual(fired, [0, 1], "each hit fires once, in order of due time");
    checkEqual(hits.length, 0, "fired hits are removed");
});

test("dialogue: phiên thoại theo player, đi tới node khác, đóng khi rời", async () => {
    const sessions = new DialogueSessionsState();
    const session = sessions.start("p1", {
        sourceCode: "npc",
        npcCode: "npc",
        slotId: "npc_slot",
        dialogueCode: "d",
        nodeId: "start",
        x: 5,
        y: 5,
        radius: 1,
    });
    check(sessions.has("p1") && sessions.size === 1, "session stored");
    session.goTo("n2");
    checkEqual(sessions.get("p1")?.nodeId, "n2", "node updated");
    const near = (range: number) => ({ isNear: (_x: number, _y: number, r: number) => r >= range });
    check(session.isNear(near(1.5)), "within radius plus margin");
    check(!session.isNear(near(2)), "beyond radius plus margin");
    sessions.drop("p1");
    check(!sessions.has("p1"), "dropped");
});

test("rewards: con trỏ chia item theo party và dọn party đã rời room", async () => {
    const loot = new PartyLootState();
    checkEqual(loot.cursorOf("a"), 0, "default cursor");
    loot.advance("a", 3);
    checkEqual(loot.cursorOf("a"), 3, "advanced");
    for (let i = 0; i < 70; i++) loot.advance(`p${i}`, i);
    loot.prune(new Set(["a"]));
    checkEqual(loot.cursorOf("a"), 3, "present party kept");
    checkEqual(loot.cursorOf("p5"), 0, "absent party dropped");
});

test("wallet: cộng, trừ đủ tiền, không đủ thì không đổi gì", async () => {
    const wallet = new WalletState(createWallet());
    wallet.credit([
        { code: CurrencyCode.GOLD, amount: 100 },
        { code: CurrencyCode.GOLD, amount: -5 },
    ]);
    checkEqual(wallet.balanceOf(CurrencyCode.GOLD), 100, "credited, non-positive ignored");
    check(wallet.canAfford([{ code: CurrencyCode.GOLD, amount: 100 }]), "can afford exact");
    check(!wallet.debit([{ code: CurrencyCode.GOLD, amount: 101 }]), "not enough");
    checkEqual(wallet.balances[CurrencyCode.GOLD].totalSpent, 0, "nothing spent on refusal");
    check(wallet.debit([{ code: CurrencyCode.GOLD, amount: 40 }]), "debit ok");
    checkEqual(
        wallet.balances[CurrencyCode.GOLD],
        { balance: 60, totalEarned: 100, totalSpent: 40 },
        "totals tracked"
    );
});

test("inventory: xếp stack, mở ô trống, trừ từ ô cuối, đổi ô, tràn túi", async () => {
    const type = ItemType.MATERIAL;
    const size = InventoryState.sizeOf(type);
    const inventory = new InventoryState({
        [ItemType.EQUIPMENT]: [],
        [ItemType.CONSUMABLE]: [],
        [ItemType.MATERIAL]: [],
    });
    const stackable = { id: "mat", stackable: true, maxStack: 10 };
    const init = { source: ItemSource.SYSTEM };

    checkEqual(inventory.add(type, stackable, 25, init), { added: 25, overflow: 0 }, "25 → 3 ô");
    checkEqual(inventory.bag(type).length, 3, "three stacks");
    checkEqual(inventory.count(type, "mat"), 25, "counted");
    check(!inventory.remove(type, "mat", 26), "not enough: refused");
    checkEqual(inventory.count(type, "mat"), 25, "refusal changes nothing");
    check(inventory.remove(type, "mat", 7), "remove");
    checkEqual(inventory.count(type, "mat"), 18, "remaining");
    checkEqual(inventory.freeSlotCount(type), size - inventory.bag(type).length, "free slots");

    checkEqual(
        inventory.moveSlot(type, 0, size),
        Response.error("INVENTORY_SLOT_INVALID"),
        "target out of range"
    );
    checkEqual(
        inventory.moveSlot(type, size - 1, 0),
        Response.error("INVENTORY_SLOT_EMPTY"),
        "source empty"
    );
    const before = inventory.bag(type).map((entry) => entry.slotIndex);
    check(!Response.isError(inventory.moveSlot(type, 0, 1)), "swap ok");
    checkEqual(
        inventory.bag(type).map((entry) => entry.slotIndex),
        before.map((slot) => (slot === 0 ? 1 : slot === 1 ? 0 : slot)),
        "slots swapped"
    );

    const overflow = inventory.add(type, stackable, size * 10 + 5, init);
    check(overflow.overflow > 0, "full bag overflows");
    checkEqual(inventory.freeSlotCount(type), 0, "no free slot left");
});

test("quest log: cờ, mở khoá chức năng, map đã đến, quest hằng ngày thay bộ cũ", async () => {
    const data = { flags: {}, quests: {}, dailyQuests: null } as never as ConstructorParameters<
        typeof QuestLogState
    >[0];
    const log = new QuestLogState(data);
    const now = DateTime.fromISO("2026-01-01T08:00:00Z");
    check(!log.hasFlag("met"), "no flag yet");
    log.setFlag("met");
    check(log.hasFlag("met"), "flag set");
    log.unlockFeature("daily_quest");
    check(log.isUnlocked("daily_quest"), "feature unlocked");
    checkEqual(log.unlockedFeatures(), ["daily_quest"], "unlocked list");
    log.visitMap("town");
    check(log.hasVisitedMap("town") && !log.hasVisitedMap("forest"), "visited maps");

    log.start("old1", now);
    check(log.entryOf("old1")?.status === "active", "quest started");
    log.replaceDaily({ date: "2026-01-01", quests: [{ code: "new1" }] as never }, ["old1"], now);
    check(log.entryOf("old1") === undefined, "old daily quest dropped");
    check(log.entryOf("new1")?.status === "active", "new daily quest started");
    checkEqual(log.dailyQuests?.date, "2026-01-01", "daily set stored");
    log.drop("new1");
    check(log.entryOf("new1") === undefined, "abandon drops progress");
});

test("equipment: món trong túi ↔ đang mặc giữ nguyên id và metadata", async () => {
    const entry = {
        id: "e1",
        itemId: "i1",
        slotIndex: 4,
        quantity: 1,
        source: ItemSource.DROP,
        isLocked: true,
        metadata: { level: 3 },
    } as never as InventoryItem;
    const equipped = EquipmentInstanceState.toEquipped(entry);
    checkEqual(equipped.id, "e1", "id kept");
    checkEqual(equipped.metadata, entry.metadata, "metadata kept");
    const back = EquipmentInstanceState.toInventoryItem(equipped, 9);
    checkEqual(
        [back.id, back.slotIndex, back.quantity, back.isLocked],
        ["e1", 9, 1, true],
        "back to the bag at the requested slot"
    );
    check(
        EquipmentInstanceState.from({ ...entry, itemId: "not-in-catalog" }) === undefined,
        "unknown item is not an equipment"
    );
});
