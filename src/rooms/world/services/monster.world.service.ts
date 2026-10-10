import { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { MonsterStatus } from "@/modules/monsters/enums/monster-status.enum.js";
import { MonsterType } from "@/modules/monsters/enums/monster-type.enum.js";
import {
    rollMonsterLevel,
    rollMonsterVariant,
} from "@/modules/monsters/utils/monster-spawn.util.js";
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
/** Khoảng cách (tile) giữa các con cùng 1 spawn có toạ độ. */
const MONSTER_SPAWN_SPACING = 2;

export class MonsterWorldService {
    private readonly respawningMonsters = new WeakSet<MonsterWorldState>();
    private readonly attackChain = new MonsterAttackChain();
    private readonly chains = new WorldChain<MonsterChainContext>([
        new MonsterDeathChain(),
        new MonsterFindTargetChain(),
        new MonsterMoveChain(this.attackChain),
        this.attackChain,
    ]);

    /**
     * Sinh monster theo `game_maps.monsterSpawns`: tại `spawnX/spawnY` của spawn (nhiều con thì xếp hàng
     * ngang), thiếu toạ độ thì xếp chéo cách nhau 5 ô như trước. Loại, độ hiếm và level của từng con
     * roll riêng (`rollMonsterVariant`, `rollMonsterLevel`) — hồi sinh roll lại.
     */
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
            const config = masterDataCacheService.get(MasterDataKey.MONSTER_SPAWN_CONFIG);
            for (let i = 0; i < spawn.count; i++) {
                const variant = rollMonsterVariant(spawn, config, countAliveElites(monsters));
                const level = rollMonsterLevel(monster.level, spawn);
                const index = monsters.length;
                const { spawnX, spawnY } = spawn;
                const position =
                    spawnX !== undefined && spawnY !== undefined
                        ? { x: spawnX + i * MONSTER_SPAWN_SPACING, y: spawnY }
                        : { x: index * 5, y: index * 5 };
                monsters.push(new MonsterWorldState({ monster, spawn, variant, level, ...position }));
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
            // Roll lại biến thể + level; map đã đủ elite thì spawn `random` ra normal.
            const { definition, spawn } = monster;
            const config = masterDataCacheService.get(MasterDataKey.MONSTER_SPAWN_CONFIG);
            const variant = rollMonsterVariant(
                spawn,
                config,
                countAliveElites(room.state.monsters, monster)
            );
            monster.applyVariant(variant, rollMonsterLevel(definition.level, spawn));
            monster.setSpawns();
            this.respawningMonsters.delete(monster);
        }, MONSTER_RESPAWN_MS);
    }
}

/** Số elite đang sống (không tính `except`) — spawn `random` dựa vào đây để chỉ có tối đa `maxElitesPerMap` elite cùng lúc. */
const countAliveElites = (monsters: Iterable<MonsterWorldState>, except?: MonsterWorldState) => {
    let count = 0;
    for (const monster of monsters) {
        if (
            monster !== except &&
            monster.monsterType === MonsterType.ELITE &&
            monster.status === MonsterStatus.ALIVE
        ) {
            count++;
        }
    }
    return count;
};

export const monsterWorldService = new MonsterWorldService();
