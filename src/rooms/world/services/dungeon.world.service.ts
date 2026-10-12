import { randomUUID } from "node:crypto";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import type {
    DungeonChamber,
    DungeonClearReward,
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
import { monsterRewardService } from "@/modules/rewards/services/monster-reward.service.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import { randomInt, rollChance } from "@/modules/rewards/utils/reward-roll.util.js";
import { resolveRewardSpec } from "@/modules/rewards/utils/reward-spec.util.js";
import type { PlayerClient } from "@/rooms/base/base-player.room.js";
import { DungeonWorldState } from "@/rooms/world/schema/dungeon.world.state.js";
import type { MonsterWorldState } from "@/rooms/world/schema/monster.world.state.js";
import type { PlayerWorldState } from "@/rooms/world/schema/player.world.state.js";
import { contentWorldService } from "@/rooms/world/services/content.world.service.js";
import { monsterWorldService } from "@/rooms/world/services/monster.world.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import { questWorldService } from "@/rooms/world/services/quest.world.service.js";
import { rewardWorldService } from "@/rooms/world/services/reward.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import {
    newTally,
    toMemberMessage,
    type DungeonRewardTally,
} from "@/rooms/world/utils/dungeon-reward.world.util.js";
import {
    MapTransferError,
    WorldMessage,
    WorldRoomName,
    type DungeonChamberClearMessage,
    type DungeonClearMessage,
    type MapChangeMessage,
} from "@/rooms/world/world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Sau khi hạ boss, ở lại tối đa chừng này giây trước khi bị đưa ra ngoài. */
export const DUNGEON_LEAVE_DELAY_SEC = 60;
/** Chờ thành viên party vào đủ trước khi bắt đầu chamber đầu tiên. */
export const DUNGEON_JOIN_GRACE_MS = 15_000;
/** Có người đã qua cổng vào chamber kế mà người khác chưa qua thì chờ chừng này ms, rồi đóng cổng và đưa người chưa qua sang chỗ vào. */
export const DUNGEON_CROSS_GRACE_MS = 10_000;

/** Tiến độ 1 instance dungeon (server-only; phần HUD cần thấy nằm ở `DungeonWorldState`). */
export interface DungeonRuntime {
    config: DungeonConfig;
    instanceId: string;
    started: boolean;
    startedAt: number;
    /** Người được party kỳ vọng vào instance (rỗng = bắt đầu ngay khi người đầu tiên vào). */
    expected: string[];
    joined: Set<string>;
    /** `elapsedTime` lúc người đầu tiên vào; chờ đủ người tối đa `DUNGEON_JOIN_GRACE_MS`. */
    firstJoinAt: number | null;
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
    /** `elapsedTime` lúc người đầu tiên qua cổng vào chamber kế (chờ những người còn lại tới `DUNGEON_CROSS_GRACE_MS`). */
    crossedAt: number | null;
    cleared: boolean;
    /** Những gì từng người nhận được trong lần đi này (key = playerId) — hiện ở bảng thưởng sau khi clear. */
    rewards: Map<string, DungeonRewardTally>;
    /** Chủ party lúc vào (nguồn: kỳ vọng của party room) — người duy nhất được bấm "đi lại". Rỗng nếu không rõ. */
    leaderPlayerId: string;
}

const isDead = (monster: MonsterWorldState) =>
    monster.hp <= 0 || monster.status === MonsterStatus.DEAD;

/**
 * Dungeon = một chuỗi chamber trong 1 room. Mỗi chamber có nhiều phase quái spawn theo giây; hạ hết quái
 * mọi phase thì cổng mở, người chơi tự đi sang chamber kế — qua khỏi cổng vào của chamber kế thì chamber đó
 * bắt đầu và cổng đóng lại sau lưng; chamber cuối là boss. Vào dungeon lưu chỗ
 * đứng cũ (`DungeonSession`), thoát thì về chỗ cũ, chết thì hồi sinh ở làng gần nhất đã đến.
 */
export class DungeonWorldService {
    /** Dựng runtime + state HUD + cổng exit lúc tạo room dungeon. */
    setup(room: WorldRoom, instanceId: string, expected: string[] = [], leaderPlayerId = ""): void {
        const config = room.map.dungeon;
        if (room.map.type !== MapType.DUNGEON || !config || config.chambers.length === 0) {
            throw new Error(`Map "${room.map.code}" is not a playable dungeon`);
        }
        room.dungeon = {
            config,
            instanceId,
            started: false,
            startedAt: 0,
            expected,
            joined: new Set(),
            firstJoinAt: null,
            chamberIndex: 0,
            chamberStartedAt: 0,
            spawnedPhases: 0,
            spawningPhase: false,
            monsters: [],
            monsterLevel: 1,
            chamberCleared: false,
            crossedAt: null,
            cleared: false,
            rewards: new Map(),
            leaderPlayerId,
        };
        const state = new DungeonWorldState();
        state.chamberCount = config.chambers.length;
        room.state.dungeon = state;
    }

    /** Player vừa vào room dungeon: đặt ở chamber hiện tại; người đầu tiên khởi động chamber 0. */
    onPlayerJoined(room: WorldRoom, player: PlayerWorldState): void {
        const runtime = room.dungeon!;
        runtime.joined.add(player.id);
        if (!runtime.rewards.has(player.id)) runtime.rewards.set(player.id, newTally(player));
        runtime.firstJoinAt ??= room.clock.elapsedTime;
        // Chờ đủ người của party để level quái tính trên cả nhóm (tối đa DUNGEON_JOIN_GRACE_MS).
        if (!runtime.started && runtime.expected.every((id) => runtime.joined.has(id))) {
            this.begin(room);
        }
        const entry = runtime.config.chambers[runtime.chamberIndex].entry;
        this.place(player, entry.x, entry.y);
    }

    /** Mỗi tick: spawn phase tới hạn, đếm quái, hoàn thành chamber, hết giờ. */
    tick(room: WorldRoom): void {
        const runtime = room.dungeon;
        const state = room.state.dungeon;
        if (!runtime || !state) return;
        const now = room.clock.elapsedTime;
        if (!runtime.started) {
            if (
                runtime.firstJoinAt !== null &&
                now - runtime.firstJoinAt >= DUNGEON_JOIN_GRACE_MS
            ) {
                this.begin(room);
            }
            return;
        }

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
        state.elapsedSec = Math.floor((now - runtime.startedAt) / 1000);

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
        if (runtime.chamberCleared) this.startNextWhenCrossed(room, now);
    }

    /** Chamber xong, cổng đã mở: ai qua khỏi cổng vào của chamber kế thì chamber kế bắt đầu và cổng đóng lại sau lưng họ. */
    private startNextWhenCrossed(room: WorldRoom, now: number): void {
        const runtime = room.dungeon!;
        const next = runtime.config.chambers[runtime.chamberIndex + 1];
        if (!next || runtime.cleared) return;
        const players = [...room.state.players.values()].filter((player) => player.hp > 0);
        const crossed = players.filter((player) => this.isPastEntry(next, player));
        if (crossed.length === 0) {
            runtime.crossedAt = null;
            return;
        }
        runtime.crossedAt ??= now;
        if (
            crossed.length === players.length ||
            now - runtime.crossedAt >= DUNGEON_CROSS_GRACE_MS
        ) {
            this.startChamber(room, runtime.chamberIndex + 1);
            // Người tới sau thì được đưa sang chỗ vào của chamber mới, không bị kẹt lại phòng trước sau cổng đã đóng.
            for (const player of players) {
                if (!crossed.includes(player)) this.place(player, next.entry.x, next.entry.y);
            }
        }
    }

    /** Đã vào trong chamber và qua hẳn cổng vào (không thì cổng đóng lên người). */
    private isPastEntry(chamber: DungeonChamber, player: PlayerWorldState): boolean {
        const { bounds, entryGate } = chamber;
        const edge = entryGate ? entryGate.x + entryGate.w : bounds.x;
        return (
            player.x >= edge &&
            player.x < bounds.x + bounds.w &&
            player.y >= bounds.y &&
            player.y < bounds.y + bounds.h
        );
    }

    /** Vào dungeon từ portal ở map thường: lưu chỗ đứng cũ, tạo instance mới, báo client join room dungeon. */
    async enter(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        dungeon: GameMap,
        spawnId: string,
        instanceId: string = randomUUID()
    ): Promise<string | undefined> {
        if (player.level < dungeon.minLevel) return MapTransferError.LEVEL_TOO_LOW;
        if (!dungeon.dungeon || dungeon.dungeon.chambers.length === 0) {
            return MapTransferError.MAP_NOT_OPEN;
        }
        // Đi lại từ trong dungeon: chỗ trở về vẫn là chỗ đứng trước lần vào đầu tiên.
        const previous = room.dungeon ? player.dungeonSession : undefined;
        const session: DungeonSession = {
            dungeonCode: dungeon.code,
            instanceId,
            returnMapCode: previous?.returnMapCode ?? room.map.code,
            returnX: previous?.returnX ?? player.x,
            returnY: previous?.returnY ?? player.y,
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
            if (client && player.dungeonSession && !player.pendingMapCode) {
                await this.leave(room, client as PlayerClient, player, "return");
            }
        }
    }

    /** Khởi động chamber đầu tiên (đủ người hoặc hết thời gian chờ). */
    private begin(room: WorldRoom): void {
        const runtime = room.dungeon!;
        runtime.started = true;
        runtime.startedAt = room.clock.elapsedTime;
        this.startChamber(room, 0);
        // Người đã vào trong lúc chờ đứng ở chamber đầu — không cần làm gì thêm.
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
        runtime.crossedAt = null;
        runtime.monsterLevel = dungeonMonsterLevel(
            [...room.state.players.values()].map((player) => player.level),
            runtime.config.maxLevel
        );
        state.chamberIndex = index;
        state.phaseCount = runtime.config.chambers[index].phases.length;
        state.phaseIndex = 0;
        state.exitOpen = false;
        state.monsterLevel = runtime.monsterLevel;
        this.refreshGates(room);
    }

    /** Cổng chắn của chamber hiện tại chặn đường tới khi dọn xong; chamber khác / đã dọn thì không có cổng nào. */
    private refreshGates(room: WorldRoom): void {
        const runtime = room.dungeon!;
        const chamber = runtime.config.chambers[runtime.chamberIndex];
        const gates = runtime.chamberCleared
            ? []
            : [chamber.entryGate, chamber.exitGate].filter((gate) => gate !== undefined);
        room.dungeonBounds = {
            width: room.map.width,
            height: room.map.height,
            colliders: [...room.map.colliders, ...gates],
        };
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
        this.refreshGates(room);

        const message: DungeonChamberClearMessage = {
            chamberIndex: runtime.chamberIndex,
            chamberCount: runtime.config.chambers.length,
        };
        room.broadcast(WorldMessage.DUNGEON_CHAMBER_CLEAR, message);

        if (!chamber.isBoss) return;
        runtime.cleared = true;
        state.cleared = true;
        this.grantToAll(room, runtime.config.clearReward);
        this.grantClearLoot(room, runtime.config.clearReward);
        for (const [sessionId, player] of room.state.players) {
            questWorldService.onEvent(room, sessionId, player, {
                type: QuestObjectiveType.CLEAR_DUNGEON,
                targetCode: room.map.code,
            });
        }
        const clear: DungeonClearMessage = {
            leaveInSec: DUNGEON_LEAVE_DELAY_SEC,
            members: [...runtime.rewards.values()].map(toMemberMessage),
            leaderPlayerId: runtime.leaderPlayerId,
        };
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
                resolveRewardSpec(spec, ItemSource.SYSTEM),
                true
            );
        }
    }

    /**
     * Thưởng clear thêm theo `clearReward` của dungeon: item rơi thêm (trúng tỉ lệ thì chiếm 1 slot) rồi trang bị
     * biome lấp các slot còn lại sau item cố định của `clearReward`. Mỗi người roll riêng.
     */
    private grantClearLoot(room: WorldRoom, reward: DungeonClearReward | undefined): void {
        if (!reward?.slots) return;
        const freeSlots = Math.max(0, reward.slots - reward.items.length);
        for (const [sessionId, player] of room.state.players) {
            const items: ItemReward[] = [];
            for (const drop of reward.dropItems) {
                if (items.length >= freeSlots) break;
                const item = itemService.getByCode(drop.itemCode);
                if (!item || !rollChance(drop.rate)) continue;
                items.push({ itemId: item.id, quantity: randomInt(drop.min, drop.max) });
            }
            for (let slot = items.length; reward.equipment && slot < freeSlots; slot++) {
                const piece = monsterRewardService.rollEquipment(reward.equipment.biome, {
                    rate: 1,
                    rarity: reward.equipment.rarity,
                });
                if (piece) items.push(piece);
            }
            if (items.length === 0) continue;
            rewardWorldService.grant(
                room,
                sessionId,
                player,
                {
                    exp: 0,
                    currency: [],
                    items,
                    source: ItemSource.DROP,
                },
                true
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
