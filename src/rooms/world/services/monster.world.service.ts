import { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { monsterService } from "@/modules/monsters/user/services/monster.service.js";
import { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import {
    MonsterAttackChain,
    MonsterChainContext,
    MonsterDeathChain,
    MonsterFindTargetChain,
    MonsterMoveChain,
} from "@/rooms/world/chains/monster.world.chain.js";
import { WorldChain } from "@/rooms/world/chains/world.chain.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

const MONSTER_RESPAWN_MS = 10_000;

export class MonsterWorldService {
    private readonly respawningMonsters = new WeakSet<MonsterWorldState>();
    private readonly attackChain = new MonsterAttackChain();
    private readonly chains = new WorldChain<MonsterChainContext>([
        new MonsterDeathChain(),
        new MonsterFindTargetChain(),
        new MonsterMoveChain(this.attackChain),
        this.attackChain,
    ]);

    public async createMonster(map: GameMap) {
        const total = 10;
        const monsterStats = await monsterService.getByCode("orc");
        const monsters = [];

        for (let i = 0; i < total; i++) {
            const monster = new MonsterWorldState({
                monster: monsterStats,
                x: i * 5,
                y: i * 5,
            });
            monsters.push(monster);
        }

        return monsters;
    }

    public chain(room: WorldRoom, dt: number): void {
        worldService.chainEntities(
            room.state.monsters,
            (monster) => monster,
            (monster) => {
                this.chains.execute({
                    room,
                    monster,
                    dt,
                    scheduleRespawn: (deadMonster) => {
                        this.attackChain.cancelPendingAttack(deadMonster);
                        this.scheduleRespawn(room, deadMonster);
                    },
                });
            }
        );
    }

    private scheduleRespawn(room: WorldRoom, monster: MonsterWorldState): void {
        if (this.respawningMonsters.has(monster)) return;

        this.respawningMonsters.add(monster);
        room.clock.setTimeout(() => {
            monster.setSpawns();
            this.respawningMonsters.delete(monster);
        }, MONSTER_RESPAWN_MS);
    }
}

export const monsterWorldService = new MonsterWorldService();
