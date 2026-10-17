import assert from "node:assert/strict";
import { MonsterIdleHealChain } from "@/rooms/world/monsters/chains/monster-idle-heal.world.chain.js";
import type { MonsterChainContext } from "@/rooms/world/monsters/chains/monster.world.chain.js";
import { MapSpawnKind } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { MapDefinitionSchema } from "@/modules/maps/schemas/map-definition.schema.js";
import { expandMonsterGroup } from "@/modules/maps/seeds/map-build.seed-util.js";

const TICK_RATE = 20;

/** Monster tối thiểu cho chain: máu, bộ đếm tick và spawn. */
const dummy = (healAfterIdleSec: number | undefined, hp: number, maxHp = 1000) =>
    ({
        hp,
        maxHp,
        idleTicks: 0,
        spawn: { healAfterIdleSec },
    }) as unknown as MonsterChainContext["monster"];

const tick = (monster: MonsterChainContext["monster"], times: number) => {
    const chain = new MonsterIdleHealChain();
    const context = { room: { tickRate: TICK_RATE }, monster } as unknown as MonsterChainContext;
    for (let i = 0; i < times; i++) chain.execute(context);
};

describe("hồi máu khi không bị đánh (healAfterIdleSec)", () => {
    it("quá 3 giây không nhận sát thương thì hồi đầy máu", () => {
        const monster = dummy(3, 400);
        tick(monster, 3 * TICK_RATE - 1);
        assert.equal(monster.hp, 400, "chưa đủ 3 giây");
        tick(monster, 1);
        assert.equal(monster.hp, 1000);
        assert.equal(monster.idleTicks, 0);
    });

    it("bị đánh (idleTicks về 0) thì đếm lại từ đầu", () => {
        const monster = dummy(3, 400);
        tick(monster, 2 * TICK_RATE);
        monster.idleTicks = 0; // MonsterWorldState.takeDamage làm việc này
        tick(monster, 2 * TICK_RATE);
        assert.equal(monster.hp, 400, "đánh lại giữa chừng thì chưa hồi");
        tick(monster, TICK_RATE);
        assert.equal(monster.hp, 1000);
    });

    it("spawn không khai healAfterIdleSec thì không hồi", () => {
        const monster = dummy(undefined, 400);
        tick(monster, 60 * TICK_RATE);
        assert.equal(monster.hp, 400);
    });

    it("máu đầy thì không đếm; quái đã chết không hồi", () => {
        const full = dummy(3, 1000);
        tick(full, 10 * TICK_RATE);
        assert.equal(full.idleTicks, 0);
        const dead = dummy(3, 0);
        tick(dead, 10 * TICK_RATE);
        assert.equal(dead.hp, 0);
    });

    it("định nghĩa map truyền healAfterIdleSec xuống từng spawn", () => {
        const def = MapDefinitionSchema.parse({
            code: "t",
            type: MapType.FIELD,
            spawnPoints: [{ id: "default", kind: MapSpawnKind.DEFAULT }],
            monsterGroups: [
                {
                    markerId: "g1",
                    members: [
                        { monsterCode: "training_slime", count: 2, healAfterIdleSec: 3 },
                        { monsterCode: "slime", count: 1 },
                    ],
                },
            ],
        });
        const spawns = expandMonsterGroup(def.monsterGroups[0], 5, 5);
        assert.deepEqual(
            spawns.map((s) => [s.monsterCode, s.healAfterIdleSec]),
            [
                ["training_slime", 3],
                ["training_slime", 3],
                ["slime", undefined],
            ]
        );
    });
});
