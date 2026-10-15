import assert from "node:assert/strict";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    CrowdControlType,
    DamageScalingType,
    DamageType,
    HitDelivery,
    HitShape,
    ProjectileHitBehavior,
    ProjectileMovementType,
    SkillEffectType,
    StatusEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import type { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { SkillDeliveryWorldService } from "@/rooms/world/services/skill-delivery.world.service.js";
import {
    PendingSkillHit,
    skillReachesTarget,
    tickPendingSkillHits,
} from "@/rooms/world/utils/skill-attack.world.util.js";
import { intersectsSkillHitEvent } from "@/rooms/world/utils/skill-hitbox.world.util.js";
import {
    applySkillHit,
    monsterSkillOwner,
    playerSkillOwner,
} from "@/rooms/world/utils/skill-owner.world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

const TICK_RATE = 40;
const DT = 1 / TICK_RATE;
const hitbox = { offsetX: 0, offsetY: 0.35, width: 0.4, height: 0.6 } as HitboxColliderState;

const event = (overrides: Partial<SkillHitEvent>): SkillHitEvent => ({
    eventIndex: 0,
    triggerTicks: 0,
    shape: HitShape.CIRCLE,
    range: 0,
    width: 0,
    height: 0,
    radius: 0,
    angle: 90,
    effects: [
        {
            effectType: SkillEffectType.DAMAGE,
            baseValue: 10,
            scalingType: DamageScalingType.NONE,
            scalingValue: 0,
            durationMs: 0,
            damageType: DamageType.TRUE,
        },
    ] as SkillHitEvent["effects"],
    delivery: HitDelivery.HITBOX,
    ...overrides,
});

const skill = (skillHitEvents: SkillHitEvent[], castRange = 4) =>
    ({ id: "skill", code: "test", castRange, skillHitEvents }) as unknown as Skill;

const pending = (s: Skill): PendingSkillHit => ({
    skill: s,
    event: s.skillHitEvents[0],
    attackSerial: 1,
    eventIndex: 0,
    ticksUntilHit: 0,
    direction: "right" as PendingSkillHit["direction"],
});

/** Room giả: 1 monster bắn, các player làm mục tiêu (damage TRUE nên luôn trúng). */
function createRoom(targets: { id: string; x: number; y: number }[]) {
    const players = new Map(
        targets.map((target) => {
            const player = {
                ...target,
                hp: 100,
                hitbox,
                damageTaken: [] as number[],
                toDamageCombatant: () => ({ id: target.id, stats: {}, hp: 100, maxHp: 100 }),
                takeDamage(damage: number): void {
                    this.damageTaken.push(damage);
                },
            };
            return [target.id, player];
        })
    );
    const monster = {
        id: "monster",
        toDamageCombatant: () => ({
            id: "monster",
            stats: { [StatKey.PHYSICAL_ATTACK]: 10 },
            hp: 100,
            maxHp: 100,
        }),
        heal: (): void => undefined,
    } as unknown as MonsterWorldState;
    const room = {
        tickRate: TICK_RATE,
        map: { width: 30, height: 30 },
        state: {
            players,
            monsters: [],
            projectiles: new Map(),
            areas: new Map(),
            auras: new Map(),
        },
    } as unknown as WorldRoom;
    return { room, players, owner: monsterSkillOwner(monster) };
}

describe("SkillDeliveryWorldService", () => {
    const arrow = skill([
        event({
            delivery: HitDelivery.PROJECTILE,
            projectile: {
                movementType: ProjectileMovementType.STRAIGHT,
                hitBehavior: ProjectileHitBehavior.DESTROY,
                speed: 12,
                maxDistance: 6,
                radius: 0.15,
                maxHits: 1,
            },
        }),
    ]);

    it("bắn đạn về phía mục tiêu, trúng 1 lần rồi biến mất", () => {
        const service = new SkillDeliveryWorldService();
        const { room, players, owner } = createRoom([{ id: "a", x: 6, y: 5.5 }]);
        const target = players.get("a")!;
        service.deliver(room, {
            owner,
            skill: arrow,
            hit: pending(arrow),
            originX: 2,
            originY: 5,
            aim: target,
        });
        assert.equal(room.state.projectiles.size, 1);
        const [projectile] = [...room.state.projectiles.values()];
        assert.ok(projectile.dirY > 0, "ngắm xuống giữa hitbox mục tiêu");

        for (let tick = 0; tick < 40 && room.state.projectiles.size > 0; tick++) {
            service.chain(room, DT);
        }
        assert.equal(room.state.projectiles.size, 0);
        assert.deepEqual(target.damageTaken, [10]);
    });

    it("đạn chặn bởi mục tiêu đầu tiên trên đường bay (DESTROY)", () => {
        const service = new SkillDeliveryWorldService();
        const { room, players, owner } = createRoom([
            { id: "near", x: 4, y: 5.25 },
            { id: "far", x: 6, y: 5.25 },
        ]);
        service.deliver(room, {
            owner,
            skill: arrow,
            hit: pending(arrow),
            originX: 2,
            originY: 5,
        });
        for (let tick = 0; tick < 40; tick++) service.chain(room, DT);
        assert.deepEqual(players.get("near")!.damageTaken, [10]);
        assert.deepEqual(players.get("far")!.damageTaken, []);
    });

    it("đạn hết tầm thì biến mất, không trúng gì", () => {
        const service = new SkillDeliveryWorldService();
        const { room, players, owner } = createRoom([{ id: "a", x: 12, y: 5.25 }]);
        service.deliver(room, {
            owner,
            skill: arrow,
            hit: pending(arrow),
            originX: 2,
            originY: 5,
        });
        for (let tick = 0; tick < 40; tick++) service.chain(room, DT);
        assert.equal(room.state.projectiles.size, 0);
        assert.deepEqual(players.get("a")!.damageTaken, []);
    });

    it("vùng đặt ở chân mục tiêu, nổ sau delay, trúng mọi mục tiêu trong vùng", () => {
        const service = new SkillDeliveryWorldService();
        const { room, players, owner } = createRoom([
            { id: "a", x: 5, y: 5 },
            { id: "b", x: 5.5, y: 5 },
            { id: "c", x: 8, y: 5 },
        ]);
        const holy = skill([
            event({
                delivery: HitDelivery.AREA,
                radius: 0.6,
                area: { delayMs: 150, untargetedDistance: 1.5 },
            }),
        ]);
        service.deliver(room, {
            owner,
            skill: holy,
            hit: pending(holy),
            originX: 2,
            originY: 5,
            aim: players.get("a")!,
        });
        const [area] = [...room.state.areas.values()];
        assert.equal(area.x, 5);
        assert.equal(area.ticksUntilImpact, 6);

        for (let tick = 0; tick < 6; tick++) service.chain(room, DT);
        assert.deepEqual(players.get("a")!.damageTaken, []);
        service.chain(room, DT);
        assert.deepEqual(players.get("a")!.damageTaken, [10]);
        assert.deepEqual(players.get("b")!.damageTaken, [10]);
        assert.deepEqual(players.get("c")!.damageTaken, []);
        assert.equal(room.state.areas.size, 0);
    });

    it("vùng kéo dài gây damage lặp mỗi tickMs cho tới hết durationMs", () => {
        const service = new SkillDeliveryWorldService();
        const { room, players, owner } = createRoom([{ id: "a", x: 5, y: 5 }]);
        const rain = skill([
            event({
                delivery: HitDelivery.AREA,
                radius: 0.6,
                // 150 ms = 6 tick đầu tiên, rồi mỗi 100 ms = 4 tick; 400 ms = 16 tick → 3 lần.
                area: { delayMs: 150, untargetedDistance: 1.5, durationMs: 400, tickMs: 100 },
            }),
        ]);
        service.deliver(room, {
            owner,
            skill: rain,
            hit: pending(rain),
            originX: 2,
            originY: 5,
            aim: players.get("a")!,
        });
        for (let tick = 0; tick < 7; tick++) service.chain(room, DT);
        assert.deepEqual(players.get("a")!.damageTaken, [10]);
        assert.equal(room.state.areas.size, 1);
        for (let tick = 0; tick < 4; tick++) service.chain(room, DT);
        assert.deepEqual(players.get("a")!.damageTaken, [10, 10]);
        for (let tick = 0; tick < 4; tick++) service.chain(room, DT);
        assert.deepEqual(players.get("a")!.damageTaken, [10, 10, 10]);
        assert.equal(room.state.areas.size, 0);
    });

    it("vùng kéo về trong castRange khi mục tiêu ở xa", () => {
        const service = new SkillDeliveryWorldService();
        const { room, players, owner } = createRoom([{ id: "a", x: 12, y: 5 }]);
        const holy = skill(
            [
                event({
                    delivery: HitDelivery.AREA,
                    radius: 0.6,
                    area: { delayMs: 0, untargetedDistance: 1 },
                }),
            ],
            4
        );
        service.deliver(room, {
            owner,
            skill: holy,
            hit: pending(holy),
            originX: 2,
            originY: 5,
            aim: players.get("a")!,
        });
        const [area] = [...room.state.areas.values()];
        assert.equal(area.x, 6);
        assert.equal(area.ticksUntilImpact, 0);
    });
});

describe("skillReachesTarget", () => {
    const target = { x: 4, y: 5, hitbox };
    const origin = { x: 1, y: 5, direction: "right" };

    it("đánh xa: trong castRange là tới", () => {
        const ranged = skill([event({ delivery: HitDelivery.PROJECTILE })], 3.5);
        assert.equal(skillReachesTarget(ranged, origin, target), true);
        assert.equal(skillReachesTarget(ranged, { ...origin, x: 0 }, target), false);
    });

    it("cận chiến: hitbox phải chạm mục tiêu", () => {
        const melee = skill([event({ shape: HitShape.RECT, range: 1.2, width: 1 })]);
        assert.equal(skillReachesTarget(melee, origin, target), false);
        assert.equal(skillReachesTarget(melee, { ...origin, x: 3 }, target), true);
    });
});

describe("hình elip", () => {
    const origin = { x: 0, y: 0, direction: "right" };
    const point = { offsetX: 0, offsetY: 0, width: 0.2, height: 0.2 } as HitboxColliderState;
    // Đường kính 4 theo hướng đánh, 1 theo trục dọc.
    const ellipse = event({ shape: HitShape.ELLIPSE, width: 4, height: 1 });

    it("dài theo hướng đánh, hẹp theo trục dọc", () => {
        assert.equal(intersectsSkillHitEvent(origin, 1.8, 0, point, ellipse), true);
        assert.equal(intersectsSkillHitEvent(origin, 0, -0.4, point, ellipse), true);
        assert.equal(intersectsSkillHitEvent(origin, 0, -1, point, ellipse), false);
        assert.equal(intersectsSkillHitEvent(origin, 2.5, 0, point, ellipse), false);
    });

    it("hai trục bằng nhau thì như hình tròn", () => {
        const round = event({ shape: HitShape.ELLIPSE, width: 2, height: 2 });
        const circle = event({ shape: HitShape.CIRCLE, radius: 1 });
        for (const [x, y] of [
            [0.5, 0.5],
            [0.9, 0.9],
            [1.4, 0],
            [0, -1.2],
        ]) {
            assert.equal(
                intersectsSkillHitEvent(origin, x, y, point, round),
                intersectsSkillHitEvent(origin, x, y, point, circle)
            );
        }
    });
});

describe("vùng buff (AURA)", () => {
    const SLOT = 1;
    const aura = {
        durationMs: 2000,
        durationMsPerLevel: 1000,
        radiusX: 2.2,
        radiusY: 0.57,
        radiusScalePerLevel: 0.1,
        tickMs: 1000,
        healScaling: 2,
        damageScaling: 0,
    };
    const buff = (overrides: Partial<typeof aura> = {}) =>
        ({
            id: "aura-skill",
            code: "aura_test",
            cooldownMs: 5000,
            skillHitEvents: [
                event({
                    shape: HitShape.ELLIPSE,
                    width: 4.4,
                    height: 1.14,
                    effects: [],
                    delivery: HitDelivery.AURA,
                    aura: { ...aura, ...overrides },
                }),
            ],
        }) as unknown as Skill;

    const player = (id: string, x: number, y: number, hp: number, partyRoomId: string | null) => ({
        id,
        x,
        y,
        hp,
        maxHp: 100,
        hitbox,
        partyRoomId,
        attackSerial: 0,
        stats: { [StatKey.MAGIC_ATTACK]: 10 },
        cooldowns: new Map<number, number>(),
        heal(amount: number): void {
            if (this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + Math.floor(amount));
        },
        setSkillCooldownTicks(slot: number, ticks: number): void {
            this.cooldowns.set(slot, ticks);
        },
        toDamageCombatant() {
            return { id, stats: this.stats, hp: this.hp, maxHp: this.maxHp };
        },
    });

    const monster = (id: string, x: number, y: number) => ({
        id,
        x,
        y,
        hp: 1000,
        hitbox,
        damageTaken: [] as number[],
        stats: {},
        setAggroTarget: (): void => undefined,
        toDamageCombatant() {
            return { id, stats: this.stats, hp: this.hp, maxHp: 1000 };
        },
        takeDamage(damage: number): void {
            this.damageTaken.push(damage);
        },
    });

    function createAuraRoom() {
        const caster = player("caster", 5, 5, 50, "party-1");
        const mate = player("mate", 6, 5, 50, "party-1"); // đồng đội trong vùng
        const stranger = player("stranger", 6.5, 5, 50, "party-2"); // trong vùng nhưng khác party
        const faraway = player("faraway", 12, 5, 50, "party-1"); // cùng party nhưng ngoài vùng
        const near = monster("near", 6, 5);
        const far = monster("far", 12, 5);
        const messages: { type: string; message: Record<string, unknown> }[] = [];
        const room = {
            tickRate: TICK_RATE,
            map: { width: 30, height: 30 },
            rewind: { lastSeenBy: () => ({ value: (m: never, key: string) => m[key] }) },
            state: {
                players: new Map([
                    ["s-caster", caster],
                    ["s-mate", mate],
                    ["s-stranger", stranger],
                    ["s-faraway", faraway],
                ]),
                monsters: [near, far],
                projectiles: new Map(),
                areas: new Map(),
                auras: new Map(),
            },
            broadcast: (type: string, message: Record<string, unknown>) =>
                messages.push({ type, message }),
        } as unknown as WorldRoom;
        return { room, caster, mate, stranger, faraway, near, far, messages };
    }

    const start = (room: WorldRoom, caster: ReturnType<typeof player>, s: Skill, level = 1) =>
        new SkillDeliveryWorldService().startAura(room, {
            sessionId: "s-caster",
            player: caster as never,
            skill: s,
            slot: SLOT,
            level,
        });

    const run = (service: SkillDeliveryWorldService, room: WorldRoom, ticks: number) => {
        for (let tick = 0; tick < ticks; tick++) service.chain(room, DT);
    };

    it("hồi bản thân và đồng đội cùng party trong vùng, không hồi người khác party hay ngoài vùng", () => {
        const service = new SkillDeliveryWorldService();
        const { room, caster, mate, stranger, faraway, messages } = createAuraRoom();
        service.startAura(room, {
            sessionId: "s-caster",
            player: caster as never,
            skill: buff(),
            slot: SLOT,
            level: 1,
        });
        run(service, room, 1); // lượt hiệu ứng đầu ngay tick sau khi bấm

        // 2 × MAGIC_ATTACK 10 = 20 mỗi lượt.
        assert.equal(caster.hp, 70);
        assert.equal(mate.hp, 70);
        assert.equal(stranger.hp, 50);
        assert.equal(faraway.hp, 50);
        assert.deepEqual(
            messages.map((entry) => [entry.message.sessionId, entry.message.hp]).sort(),
            [
                ["s-caster", 20],
                ["s-mate", 20],
            ]
        );
    });

    it("level làm vùng to ra và sống lâu hơn; hết thời gian mới tính hồi chiêu", () => {
        const service = new SkillDeliveryWorldService();
        const { room, caster } = createAuraRoom();
        service.startAura(room, {
            sessionId: "s-caster",
            player: caster as never,
            skill: buff(),
            slot: SLOT,
            level: 3,
        });
        const [state] = [...room.state.auras.values()];
        assert.ok(Math.abs(state.radiusX - 2.2 * 1.2) < 1e-9);
        assert.ok(Math.abs(state.radiusY - 0.57 * 1.2) < 1e-9);
        // 2000 + 1000 × 2 = 4000 ms = 160 tick.
        assert.equal(state.ticksLeft, 160);

        run(service, room, 159);
        assert.equal(room.state.auras.size, 1);
        assert.equal(caster.cooldowns.has(SLOT), false); // buff còn chạy: chưa đặt hồi chiêu
        run(service, room, 1);
        assert.equal(room.state.auras.size, 0);
        assert.equal(caster.cooldowns.get(SLOT), 200); // 5000 ms
    });

    it("chủ chết giữa chừng thì vùng biến mất và hồi chiêu bắt đầu tính", () => {
        const service = new SkillDeliveryWorldService();
        const { room, caster } = createAuraRoom();
        start(room, caster, buff());
        run(service, room, 10);
        assert.equal(room.state.auras.size, 1);
        caster.hp = 0;
        run(service, room, 1);
        assert.equal(room.state.auras.size, 0);
        assert.equal(caster.cooldowns.get(SLOT), 200);
    });

    it("gây damage phép lên quái trong vùng mỗi lượt, quái ngoài vùng thì không", () => {
        const service = new SkillDeliveryWorldService();
        const { room, caster, near, far } = createAuraRoom();
        service.startAura(room, {
            sessionId: "s-caster",
            player: caster as never,
            skill: buff({ damageScaling: 3, healScaling: 0, durationMs: 8000 }),
            slot: SLOT,
            level: 1,
        });
        run(service, room, 8 * TICK_RATE);

        assert.ok(near.damageTaken.length > 0, "quái trong vùng phải bị trúng");
        assert.ok(near.damageTaken.every((damage) => damage > 0));
        assert.equal(far.damageTaken.length, 0);
    });

    it("hit ALLIES hồi bản thân và đồng đội trong vùng, hiện +N cả khi đã đầy máu và báo gắn hiệu ứng", () => {
        const service = new SkillDeliveryWorldService();
        const { room, caster, mate, stranger, faraway, messages } = createAuraRoom();
        mate.hp = 100; // đã đầy máu nhưng vẫn phải thấy "+N"
        const heal = skill([
            event({
                shape: HitShape.ELLIPSE,
                effects: [],
                delivery: HitDelivery.ALLIES,
                allies: { radiusX: 2.5, radiusY: 1.8, healBase: 10, healScaling: 3 },
            }),
        ]);
        service.deliver(room, {
            owner: playerSkillOwner("s-caster", caster as never),
            skill: heal,
            hit: pending(heal),
            originX: 5,
            originY: 5,
        });

        // 10 + 3 × MAGIC_ATTACK 10 = 40.
        assert.equal(caster.hp, 90);
        assert.equal(mate.hp, 100);
        assert.equal(stranger.hp, 50); // khác party
        assert.equal(faraway.hp, 50); // ngoài vùng
        const numbers = messages
            .filter((entry) => entry.type === "potionUsed")
            .map((entry) => [entry.message.sessionId, entry.message.hp])
            .sort();
        assert.deepEqual(numbers, [
            ["s-caster", 40],
            ["s-mate", 40],
        ]);
        const effects = messages.filter((entry) => entry.type === "skillEffect");
        assert.equal(effects.length, 1);
        assert.deepEqual(effects[0].message, {
            skillId: "skill",
            sessionIds: ["s-caster", "s-mate"],
        });
    });
});

describe("lịch hit", () => {
    const scheduled = (overrides: Partial<SkillHitEvent>): PendingSkillHit => ({
        ...pending(skill([event(overrides)])),
        ticksUntilHit: 1,
    });

    it("hit ALLIES không có damage vẫn được giao; hit HITBOX không có damage thì không", () => {
        const delivered: HitDelivery[] = [];
        const hits = [
            scheduled({ effects: [], delivery: HitDelivery.ALLIES }),
            scheduled({ effects: [], delivery: HitDelivery.HITBOX }),
            scheduled({ delivery: HitDelivery.HITBOX }), // có damage
        ];
        tickPendingSkillHits(hits, (hit) => delivered.push(hit.event.delivery));
        assert.equal(hits.length, 0);
        assert.deepEqual(delivered.sort(), [HitDelivery.ALLIES, HitDelivery.HITBOX]);
    });
});

describe("choáng (STUN)", () => {
    const stunHit = (durationMs: number, damage = 10) => ({
        event: event({
            effects: [
                {
                    effectType: SkillEffectType.DAMAGE,
                    baseValue: damage,
                    scalingType: DamageScalingType.NONE,
                    scalingValue: 0,
                    durationMs: 0,
                    damageType: DamageType.TRUE,
                },
                {
                    effectType: SkillEffectType.APPLY_STATUS,
                    baseValue: 0,
                    scalingType: DamageScalingType.NONE,
                    scalingValue: 0,
                    durationMs,
                    damageType: DamageType.PHYSICAL,
                    statusEffectType: StatusEffectType.CONTROL,
                    crowdControlType: CrowdControlType.STUN,
                },
            ] as SkillHitEvent["effects"],
        }),
        attackSerial: 1,
        eventIndex: 0,
    });

    function setup(monsterHp: number) {
        const attacker = {
            id: "p1",
            toDamageCombatant: () => ({ id: "p1", stats: {}, hp: 100, maxHp: 100 }),
            heal: (): void => undefined,
        };
        const monster = {
            id: "m1",
            code: "slime",
            hp: monsterHp,
            stuns: [] as number[],
            setAggroTarget: (): void => undefined,
            toDamageCombatant() {
                return { id: "m1", stats: {}, hp: this.hp, maxHp: 100 };
            },
            takeDamage(damage: number): void {
                this.hp = Math.max(0, this.hp - damage);
            },
            stun(ticks: number): void {
                this.stuns.push(ticks);
            },
        };
        const room = {
            tickRate: TICK_RATE,
            state: { players: new Map([["s1", attacker]]), monsters: [monster] },
        } as unknown as WorldRoom;
        return { room, attacker, monster };
    }

    it("hit có hiệu ứng STUN làm choáng monster trúng đòn đúng số tick", () => {
        const { room, attacker, monster } = setup(100);
        applySkillHit(room, playerSkillOwner("s1", attacker as never), "m1", stunHit(2000));
        assert.equal(monster.hp, 90);
        assert.deepEqual(monster.stuns, [80]); // 2000 ms ở 40 tick/giây
    });
});

describe("đẩy lùi (KNOCKBACK)", () => {
    const knockbackHit = (distance: number, durationMs: number) => ({
        event: event({
            effects: [
                {
                    effectType: SkillEffectType.DAMAGE,
                    baseValue: 10,
                    scalingType: DamageScalingType.NONE,
                    scalingValue: 0,
                    durationMs: 0,
                    damageType: DamageType.TRUE,
                },
                {
                    effectType: SkillEffectType.KNOCKBACK,
                    baseValue: distance,
                    scalingType: DamageScalingType.NONE,
                    scalingValue: 0,
                    durationMs,
                    damageType: DamageType.PHYSICAL,
                    crowdControlType: CrowdControlType.KNOCKBACK,
                },
            ] as SkillHitEvent["effects"],
        }),
        attackSerial: 1,
        eventIndex: 0,
    });

    function setup(monsterHp: number) {
        const attacker = {
            id: "p1",
            x: 2,
            y: 3,
            direction: "right",
            toDamageCombatant: () => ({ id: "p1", stats: {}, hp: 100, maxHp: 100 }),
            heal: (): void => undefined,
        };
        const monster = {
            id: "m1",
            code: "slime",
            hp: monsterHp,
            x: 5,
            y: 7, // lệch (3, 4) so với người bắn → khoảng cách 5, hướng (0.6, 0.8)
            knocks: [] as number[][],
            setAggroTarget: (): void => undefined,
            toDamageCombatant() {
                return { id: "m1", stats: {}, hp: this.hp, maxHp: 100 };
            },
            takeDamage(damage: number): void {
                this.hp = Math.max(0, this.hp - damage);
            },
            knockback(dirX: number, dirY: number, distance: number, ticks: number): void {
                this.knocks.push([dirX, dirY, distance, ticks]);
            },
        };
        const room = {
            tickRate: TICK_RATE,
            state: { players: new Map([["s1", attacker]]), monsters: [monster] },
        } as unknown as WorldRoom;
        return { room, attacker, monster };
    }

    it("đẩy mục tiêu ra xa người đánh theo đường nối hai bên", () => {
        const { room, attacker, monster } = setup(100);
        applySkillHit(
            room,
            playerSkillOwner("s1", attacker as never),
            "m1",
            knockbackHit(2.5, 300)
        );
        assert.equal(monster.hp, 90);
        assert.equal(monster.knocks.length, 1);
        const [dirX, dirY, distance, ticks] = monster.knocks[0];
        assert.ok(Math.abs(dirX - 0.6) < 1e-9 && Math.abs(dirY - 0.8) < 1e-9);
        assert.equal(distance, 2.5);
        assert.equal(ticks, 12); // 300 ms ở 40 tick/giây
    });
});

describe("vùng đánh theo hướng ngắm (aimed)", () => {
    const point = { offsetX: 0, offsetY: 0, width: 0.2, height: 0.2 } as HitboxColliderState;
    // Dài 1.6 theo hướng ngắm, rộng 1 (±0.5) ngang hướng ngắm.
    const slash = event({ shape: HitShape.RECT, range: 1.6, width: 1, aimed: true });
    const up = { x: 0, y: -1 }; // lên (y hướng xuống)
    const diagonal = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };

    it("xoay theo hướng ngắm: đánh được phía trên, không đánh được phía bên cạnh", () => {
        const origin = { x: 5, y: 5, direction: "right", aim: up };
        assert.equal(intersectsSkillHitEvent(origin, 5, 3.8, point, slash), true);
        assert.equal(intersectsSkillHitEvent(origin, 6.2, 5, point, slash), false);
        assert.equal(intersectsSkillHitEvent(origin, 5, 6, point, slash), false); // phía sau
    });

    it("đánh chéo", () => {
        const origin = { x: 5, y: 5, direction: "right", aim: diagonal };
        assert.equal(intersectsSkillHitEvent(origin, 6, 4, point, slash), true);
        assert.equal(intersectsSkillHitEvent(origin, 6, 6, point, slash), false);
    });

    it("hit không aimed, hoặc không có hướng ngắm, vẫn chỉ theo trái / phải", () => {
        const plain = event({ shape: HitShape.RECT, range: 1.6, width: 1 });
        const aimedOrigin = { x: 5, y: 5, direction: "right", aim: up };
        assert.equal(intersectsSkillHitEvent(aimedOrigin, 6.2, 5, point, plain), true);
        assert.equal(intersectsSkillHitEvent(aimedOrigin, 5, 3.8, point, plain), false);
        const noAim = { x: 5, y: 5, direction: "left" };
        assert.equal(intersectsSkillHitEvent(noAim, 3.8, 5, point, slash), true);
    });
});
