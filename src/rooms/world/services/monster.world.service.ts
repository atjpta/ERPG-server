import { ItemRarity } from "@/modules/items/enums/item.enum.js";
import { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
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

    /** Sinh monster theo `game_maps.monsterSpawns` (xếp chéo cách nhau 5 ô, như trước). */
    public async createMonster(map: GameMap) {
        const monsters: MonsterWorldState[] = [];
        for (const spawn of map.monsterSpawns) {
            const monster = await monsterService.getByCode(spawn.monsterCode);
            if (!monster) {
                console.warn(
                    `[WorldRoom] Monster "${spawn.monsterCode}" not found (map ${map.code})`
                );
                continue;
            }
            const variant = {
                type: spawn.type ?? MonsterType.NORMAL,
                rarity: spawn.rarity ?? ItemRarity.COMMON,
            };
            for (let i = 0; i < spawn.count; i++) {
                const index = monsters.length;
                monsters.push(
                    new MonsterWorldState({ monster, variant, x: index * 5, y: index * 5 })
                );
            }
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
