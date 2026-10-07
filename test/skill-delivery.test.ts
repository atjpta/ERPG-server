import assert from "node:assert/strict";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import { StatKey } from "@/modules/player/enums/stat.enum.js";
import {
    DamageScalingType,
    DamageType,
    HitDelivery,
    HitShape,
    ProjectileHitBehavior,
    ProjectileMovementType,
    SkillEffectType,
} from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";
import type { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { SkillDeliveryWorldService } from "@/rooms/world/services/skill-delivery.world.service.js";
import {
    PendingSkillHit,
    skillReachesTarget,
} from "@/rooms/world/utils/skill-attack.world.util.js";
import { monsterSkillOwner } from "@/rooms/world/utils/skill-owner.world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

const TICK_RATE = 40;
const DT = 1 / TICK_RATE;
const hitbox = { offsetX: 0, offsetY: 0.35, width: 0.4, height: 0.6 } as HitboxColliderState;

const event = (overrides: Partial<SkillHitEvent>): SkillHitEvent => ({
    eventIndex: 0,
    triggerTicks: 0,
    shape: HitShape.CIRCLE,
    range: 0,
    offsetX: 0,
    offsetY: 0,
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
        state: { players, monsters: [], projectiles: new Map(), areas: new Map() },
    } as unknown as WorldRoom;
    return { room, players, owner: monsterSkillOwner(monster) };
}

describe("SkillDeliveryWorldService", () => {
    const arrow = skill([
        event({
            delivery: HitDelivery.PROJECTILE,
            offsetX: 0.3,
            offsetY: 0.3,
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
        const melee = skill([event({ shape: HitShape.RECT, range: 1.2, width: 1, offsetY: 0.35 })]);
        assert.equal(skillReachesTarget(melee, origin, target), false);
        assert.equal(skillReachesTarget(melee, { ...origin, x: 3 }, target), true);
    });
});
