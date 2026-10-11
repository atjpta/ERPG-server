import { randomUUID } from "node:crypto";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type {
    DungeonChamber,
    DungeonConfig,
    DungeonSession,
    GameMap,
} from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { dungeonMonsterLevel, phasesMonsterCount } from "@/modules/maps/utils/dungeon.util.js";
import { respawnPointOf } from "@/modules/maps/utils/map-file.util.js";
import { mapService } from "@/modules/maps/user/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/user/services/master-data-cache.service.js";
import { MonsterStatus } from "@/modules/monsters/enums/monster-status.enum.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import { resolveRewardSpec } from "@/modules/rewards/utils/reward-spec.util.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { DungeonWorldState } from "@/rooms/world/schema/dungeon.world.state.js";
import { InteractableWorldState } from "@/rooms/world/schema/interactable.world.state.js";
import type { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { contentWorldService } from "@/rooms/world/services/content.world.service.js";
import { monsterWorldService } from "@/rooms/world/services/monster.world.service.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import {
    MapTransferError,
    WorldMessage,
    WorldRoomName,
    type DungeonChamberClearMessage,
    type DungeonClearMessage,
    type MapChangeMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Id interactable của cổng thoát chamber: `exit_<chamberId>` (không nằm trong file map). */
export const DUNGEON_EXIT_PREFIX = "exit_";
/** Sau khi hạ boss, ở lại tối đa chừng này giây trước khi bị đưa ra ngoài. */
export const DUNGEON_LEAVE_DELAY_SEC = 60;

/** Tiến độ 1 instance dungeon (server-only; phần HUD cần thấy nằm ở `DungeonWorldState`). */
export interface DungeonRuntime {
    config: DungeonConfig;
    instanceId: string;
    started: boolean;
    startedAt: number;
    chamberIndex: number;
    chamberStartedAt: number;
    /** Số phase của chamber hiện tại đã spawn. */
    spawnedPhases: number;
    spawningPhase: boolean;
    /** Monster đã spawn của chamber hiện tại. */
    monsters: MonsterWorldState[];
    /** Level quái của chamber hiện tại. */
    monsterLevel: number;
    chamberCleared: boolean;
    cleared: boolean;
}

const isDead = (monster: MonsterWorldState) =>
    monster.hp <= 0 || monster.status === MonsterStatus.DEAD;

const exitId = (chamber: DungeonChamber) => `${DUNGEON_EXIT_PREFIX}${chamber.id}`;

/**
 * Dungeon = một chuỗi chamber trong 1 room. Mỗi chamber có nhiều phase quái spawn theo giây; phải hạ
 * hết quái mọi phase thì cổng exit mới mở sang chamber kế; chamber cuối là boss. Vào dungeon lưu chỗ
 * đứng cũ (`DungeonSession`), thoát thì về chỗ cũ, chết thì hồi sinh ở làng gần nhất đã đến.
 */
export class DungeonWorldService {
    /** Dựng runtime + state HUD + cổng exit lúc tạo room dungeon. */
    setup(room: WorldRoom, instanceId: string): void {
        const config = room.map.dungeon;
        if (room.map.type !== MapType.DUNGEON || !config || config.chambers.length === 0) {
            throw new Error(`Map "${room.map.code}" is not a playable dungeon`);
        }
        room.dungeon = {
            config,
            instanceId,
            started: false,
            startedAt: 0,
            chamberIndex: 0,
            chamberStartedAt: 0,
            spawnedPhases: 0,
            spawningPhase: false,
            monsters: [],
            monsterLevel: 1,
            chamberCleared: false,
            cleared: false,
        };
        const state = new DungeonWorldState();
        state.chamberCount = config.chambers.length;
        room.state.dungeon = state;
        for (const chamber of config.chambers) {
            if (!chamber.exit) continue;
            const exit = new InteractableWorldState({
                id: exitId(chamber),
                kind: "portal",
                code: "portal",
                x: chamber.exit.x,
                y: chamber.exit.y,
            });
            exit.active = false; // khoá tới khi chamber dọn xong
            room.state.interactables.push(exit);
        }
    }

    /** Player vừa vào room dungeon: đặt ở chamber hiện tại; người đầu tiên khởi động chamber 0. */
    onPlayerJoined(room: WorldRoom, player: PlayerWorldState): void {
        const runtime = room.dungeon!;
        if (!runtime.started) {
            runtime.started = true;
            runtime.startedAt = room.clock.elapsedTime;
            this.startChamber(room, 0);
        }
        const entry = runtime.config.chambers[runtime.chamberIndex].entry;
        this.place(player, entry.x, entry.y);
    }

    /** Mỗi tick: spawn phase tới hạn, đếm quái, hoàn thành chamber, hết giờ. */
    tick(room: WorldRoom): void {
        const runtime = room.dungeon;
        const state = room.state.dungeon;
        if (!runtime || !state || !runtime.started) return;
        const now = room.clock.elapsedTime;

        if (runtime.config.timeLimitSec) {
            const left = Math.max(
                0,
                runtime.config.timeLimitSec - Math.floor((now - runtime.startedAt) / 1000)
            );
            state.timeLeftSec = left;
            if (left === 0 && !runtime.cleared) {
                void this.leaveAll(room);
                return;
            }
        }
        if (runtime.cleared) return;

        const chamber = runtime.config.chambers[runtime.chamberIndex];
        const elapsedSec = (now - runtime.chamberStartedAt) / 1000;
        const nextPhase = chamber.phases[runtime.spawnedPhases];
        if (nextPhase && !runtime.spawningPhase && elapsedSec >= nextPhase.delaySec) {
            void this.spawnPhase(room, chamber);
        }

        const alive = runtime.monsters.filter((monster) => !isDead(monster)).length;
        const pending = phasesMonsterCount(chamber.phases.slice(runtime.spawnedPhases));
        const total = phasesMonsterCount(chamber.phases);
        state.remaining = alive + pending;
        state.total = total;
        state.phaseIndex = runtime.spawnedPhases;
        state.nextPhaseInSec = nextPhase
            ? Math.max(1, Math.ceil(nextPhase.delaySec - elapsedSec))
            : 0;

        if (
            !runtime.chamberCleared &&
            runtime.spawnedPhases === chamber.phases.length &&
            !runtime.spawningPhase &&
            alive === 0
        ) {
            this.completeChamber(room, chamber);
        }
    }

    /** Dùng cổng exit: chamber hiện tại phải xong (hoặc đã qua rồi) mới đi tiếp; chamber cuối = rời dungeon. */
    async useExit(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        id: string
    ): Promise<string | undefined> {
        const runtime = room.dungeon!;
        const index = runtime.config.chambers.findIndex((chamber) => exitId(chamber) === id);
        if (index < 0) return "Not found";
        const chamber = runtime.config.chambers[index];
        const exit = chamber.exit!;
        const passed = index < runtime.chamberIndex;
        const open = index === runtime.chamberIndex && runtime.chamberCleared;
        if (!passed && !open) return MapTransferError.EXIT_LOCKED;
        if (!contentWorldService.isNear(player, exit.x, exit.y, exit.radius)) return "Too far";

        if (index === runtime.config.chambers.length - 1) {
            return this.leave(room, client, player, "return");
        }
        if (index === runtime.chamberIndex) this.startChamber(room, index + 1);
        const entry = runtime.config.chambers[index + 1].entry;
        this.place(player, entry.x, entry.y);
        return undefined;
    }

    /** Vào dungeon từ portal ở map thường: lưu chỗ đứng cũ, tạo instance mới, báo client join room dungeon. */
    async enter(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        dungeon: GameMap,
        spawnId: string
    ): Promise<string | undefined> {
        if (player.level < dungeon.minLevel) return MapTransferError.LEVEL_TOO_LOW;
        if (!dungeon.dungeon || dungeon.dungeon.chambers.length === 0) {
            return MapTransferError.MAP_NOT_OPEN;
        }
        const session: DungeonSession = {
            dungeonCode: dungeon.code,
            instanceId: randomUUID(),
            returnMapCode: room.map.code,
            returnX: player.x,
            returnY: player.y,
        };
        player.dungeonSession = session;
        player.pendingMapCode = dungeon.code;
        player.moving = false;
        player.targetId = "";
        player.targetLocked = false;
        const message: MapChangeMessage = {
            mapCode: dungeon.code,
            spawnId,
            roomName: WorldRoomName.DUNGEON,
            instanceId: session.instanceId,
        };
        client.send(WorldMessage.MAP_CHANGE, message);
        await worldService.savePlayer(room, client.sessionId);
        return undefined;
    }

    /** Chết trong dungeon: về làng gần nhất đã đến (không ở lại dungeon). */
    async onPlayerDeath(room: WorldRoom, player: PlayerWorldState): Promise<void> {
        const client = this.clientOf(room, player);
        if (!client) return;
        player.setSpawns(player.x, player.y); // hồi đầy máu trước khi rời
        await this.leave(room, client, player, "town");
    }

    /** Client chủ động rời dungeon. */
    async leaveByClient(room: WorldRoom, client: PlayerClient): Promise<void> {
        const player = room.state.players.get(client.sessionId);
        if (player) await this.leave(room, client, player, "return");
    }

    /**
     * Đưa player ra khỏi dungeon: `return` = chỗ đứng trước khi vào; `town` = làng gần nhất đã đến.
     * Xoá session, lưu DB rồi báo client join room `world` của map đích.
     */
    private async leave(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        destination: "return" | "town"
    ): Promise<string | undefined> {
        const session = player.dungeonSession;
        if (!session) return "Not in a dungeon";
        const config = masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);
        let mapCode = session.returnMapCode;
        let spawn = { x: session.returnX, y: session.returnY };
        try {
            if (destination === "town") {
                mapCode = player.lastTownMapCode ?? config.startMapCode;
                spawn = respawnPointOf(await mapService.getActiveByCodeOrFail(mapCode));
            } else {
                await mapService.getActiveByCodeOrFail(mapCode);
            }
        } catch {
            // Map đích không còn mở: về map khởi đầu.
            mapCode = config.startMapCode;
            spawn = respawnPointOf(await mapService.getActiveByCodeOrFail(mapCode));
        }
        player.x = spawn.x;
        player.y = spawn.y;
        player.moving = false;
        player.targetId = "";
        player.targetLocked = false;
        player.dungeonSession = undefined;
        player.pendingMapCode = mapCode;
        const message: MapChangeMessage = {
            mapCode,
            spawnId: "default",
            roomName: WorldRoomName.WORLD,
        };
        client.send(WorldMessage.MAP_CHANGE, message);
        await worldService.savePlayer(room, client.sessionId);
        return undefined;
    }

    private async leaveAll(room: WorldRoom): Promise<void> {
        const runtime = room.dungeon;
        if (!runtime) return;
        // Đánh dấu để tick không gọi lại.
        runtime.cleared = true;
        for (const [sessionId, player] of room.state.players) {
            const client = room.clients.getById(sessionId);
            if (client && player.dungeonSession) {
                await this.leave(room, client as PlayerClient, player, "return");
            }
        }
    }

    private startChamber(room: WorldRoom, index: number): void {
        const runtime = room.dungeon!;
        const state = room.state.dungeon!;
        // Dọn xác quái chamber trước khỏi state.
        this.removeMonsters(room, runtime.monsters);
        runtime.chamberIndex = index;
        runtime.chamberStartedAt = room.clock.elapsedTime;
        runtime.spawnedPhases = 0;
        runtime.spawningPhase = false;
        runtime.monsters = [];
        runtime.chamberCleared = false;
        runtime.monsterLevel = dungeonMonsterLevel(
            [...room.state.players.values()].map((player) => player.level),
            runtime.config.maxLevel
        );
        state.chamberIndex = index;
        state.phaseCount = runtime.config.chambers[index].phases.length;
        state.phaseIndex = 0;
        state.exitOpen = false;
        state.monsterLevel = runtime.monsterLevel;
    }

    private async spawnPhase(room: WorldRoom, chamber: DungeonChamber): Promise<void> {
        const runtime = room.dungeon!;
        const phase = chamber.phases[runtime.spawnedPhases];
        const chamberIndex = runtime.chamberIndex;
        runtime.spawningPhase = true;
        try {
            const monsters = await monsterWorldService.createMonsters(
                room.map.code,
                phase.monsterSpawns,
                runtime.monsterLevel,
                runtime.monsters
            );
            // Chamber đã đổi trong lúc await (không nên xảy ra) thì bỏ.
            if (runtime.chamberIndex !== chamberIndex) return;
            room.state.monsters.push(...monsters);
            runtime.monsters.push(...monsters);
            runtime.spawnedPhases++;
        } finally {
            runtime.spawningPhase = false;
        }
    }

    private completeChamber(room: WorldRoom, chamber: DungeonChamber): void {
        const runtime = room.dungeon!;
        const state = room.state.dungeon!;
        runtime.chamberCleared = true;
        state.exitOpen = true;
        this.grantToAll(room, chamber.clearReward);
        const exit = room.state.interactables.find((it) => it.id === exitId(chamber));
        if (exit) exit.active = true;

        const message: DungeonChamberClearMessage = {
            chamberIndex: runtime.chamberIndex,
            chamberCount: runtime.config.chambers.length,
        };
        room.broadcast(WorldMessage.DUNGEON_CHAMBER_CLEAR, message);

        if (!chamber.isBoss) return;
        runtime.cleared = true;
        state.cleared = true;
        this.grantToAll(room, runtime.config.clearReward);
        const clear: DungeonClearMessage = { leaveInSec: DUNGEON_LEAVE_DELAY_SEC };
        room.broadcast(WorldMessage.DUNGEON_CLEAR, clear);
        room.clock.setTimeout(() => {
            void this.leaveAll(room);
        }, DUNGEON_LEAVE_DELAY_SEC * 1000);
    }

    private grantToAll(room: WorldRoom, spec: RewardSpec | undefined): void {
        if (!spec) return;
        for (const [sessionId, player] of room.state.players) {
            rewardWorldService.grant(
                room,
                sessionId,
                player,
                resolveRewardSpec(spec, ItemSource.SYSTEM)
            );
        }
    }

    private removeMonsters(room: WorldRoom, monsters: readonly MonsterWorldState[]): void {
        for (const monster of monsters) {
            const index = room.state.monsters.indexOf(monster);
            if (index >= 0) room.state.monsters.splice(index, 1);
        }
    }

    private place(player: PlayerWorldState, x: number, y: number): void {
        player.x = x;
        player.y = y;
        player.moving = false;
        player.targetId = "";
        player.targetLocked = false;
    }

    private clientOf(room: WorldRoom, player: PlayerWorldState): PlayerClient | undefined {
        for (const [sessionId, state] of room.state.players) {
            if (state === player) {
                return room.clients.getById(sessionId) as PlayerClient | undefined;
            }
        }
        return undefined;
    }
}

export const dungeonWorldService = new DungeonWorldService();
