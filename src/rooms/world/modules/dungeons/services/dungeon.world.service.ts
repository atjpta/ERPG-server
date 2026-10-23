import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import { MapErrorCode } from "@/modules/maps/enums/map-error-code.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { ItemSource } from "@/modules/items/enums/item.enum.js";
import { itemService } from "@/modules/items/services/item.service.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import type {
    DungeonChamber,
    DungeonClearReward,
    DungeonSession,
} from "@/modules/maps/types/game-map.type.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { dungeonService } from "@/modules/maps/services/dungeon.service.js";
import { mapFileService } from "@/modules/maps/services/map-file.service.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { QuestObjectiveType } from "@/modules/quests/enums/quest.enum.js";
import type { RewardSpec } from "@/modules/rewards/schemas/reward-spec.schema.js";
import { monsterRewardService } from "@/modules/rewards/services/monster-reward.service.js";
import { rewardRollService } from "@/modules/rewards/services/reward-roll.service.js";
import { rewardSpecService } from "@/modules/rewards/services/reward-spec.service.js";
import type { ItemReward } from "@/modules/rewards/types/reward.type.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import { DungeonGateState, DungeonWorldState } from "@/modules/maps/state/dungeon.state.js";
import { DungeonInstanceState } from "@/modules/maps/state/dungeon-instance.state.js";
import {
    newTally,
    toMemberMessage,
    type DungeonRewardTally,
} from "@/rooms/world/modules/dungeons/utils/dungeon-reward.world.util.js";
import type { MonsterWorldState } from "@/modules/monsters/state/monster.state.js";
import { monsterWorldService } from "@/rooms/world/modules/monsters/services/monster.world.service.js";
import type { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { rewardWorldService } from "@/rooms/world/modules/rewards/services/reward.world.service.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { WorldRoomName } from "@/rooms/world/modules/maps/enums/world-room-name.enum.js";
import type {
    DungeonChamberClearMessage,
    DungeonClearMessage,
} from "@/rooms/world/modules/dungeons/interfaces/dungeon.world.message.js";
import type { MapChangeMessage } from "@/rooms/world/modules/maps/interfaces/map.world.message.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";
import { generateEntityId } from "@/core/entities/base.entity.js";

/** Sau khi hạ boss, ở lại tối đa chừng này giây trước khi bị đưa ra ngoài. */
export const DUNGEON_LEAVE_DELAY_SEC = 60;
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
        room.dungeon = new DungeonInstanceState<DungeonRewardTally>(
            config,
            instanceId,
            expected,
            leaderPlayerId
        );
        const state = new DungeonWorldState();
        state.chamberCount = config.chambers.length;
        room.state.dungeon = state;
    }

    /** Player vừa vào room dungeon: đặt ở chamber hiện tại; người đầu tiên khởi động chamber 0. */
    onPlayerJoined(room: WorldRoom, player: PlayerWorldState): void {
        const instance = room.dungeon!;
        instance.registerJoin(player.id, room.clock.elapsedTime, () => newTally(player));
        // Chờ đủ người của party để level quái tính trên cả nhóm (tối đa DUNGEON_JOIN_GRACE_MS).
        if (instance.readyToStart) this.begin(room);
        const entry = instance.chamber.entry;
        player.placeAt(entry.x, entry.y);
    }

    /** Mỗi tick: spawn phase tới hạn, đếm quái, hoàn thành chamber, hết giờ. */
    tick(room: WorldRoom): void {
        const instance = room.dungeon;
        const state = room.state.dungeon;
        if (!instance || !state) return;
        const now = room.clock.elapsedTime;
        if (!instance.started) {
            if (instance.joinGraceExpired(now)) this.begin(room);
            return;
        }

        const left = instance.timeLeftSec(now);
        if (left !== undefined) {
            state.timeLeftSec = left;
            if (left === 0 && !instance.cleared) {
                void this.leaveAll(room);
                return;
            }
        }
        if (instance.cleared) return;
        state.elapsedSec = instance.elapsedSec(now);

        const chamber = instance.chamber;
        if (instance.isPhaseDue(now)) void this.spawnPhase(room, chamber);

        const { alive, pending, total } = instance.monsterCounts();
        state.remaining = alive + pending;
        state.total = total;
        state.phaseIndex = instance.spawnedPhases;
        state.nextPhaseInSec = instance.nextPhaseInSec(now);

        if (instance.isChamberDone(alive)) this.completeChamber(room, chamber);
        if (instance.chamberCleared) this.startNextWhenCrossed(room, now);
    }

    /** Chamber xong, cổng đã mở: ai qua khỏi cổng vào của chamber kế thì chamber kế bắt đầu và cổng đóng lại sau lưng họ. */
    private startNextWhenCrossed(room: WorldRoom, now: number): void {
        const instance = room.dungeon!;
        const next = instance.nextChamber;
        if (!next || instance.cleared) return;
        const players = [...room.state.players.values()].filter((player) => player.hp > 0);
        const crossed = players.filter((player) => instance.hasPassedEntry(next, player));
        if (!instance.trackCrossing(now, crossed.length, players.length)) return;
        this.startChamber(room, instance.chamberIndex + 1);
        // Người tới sau thì được đưa sang chỗ vào của chamber mới, không bị kẹt lại phòng trước sau cổng đã đóng.
        for (const player of players) {
            if (!crossed.includes(player)) player.placeAt(next.entry.x, next.entry.y);
        }
    }

    /** Vào dungeon từ portal ở map thường: lưu chỗ đứng cũ, tạo instance mới, báo client join room dungeon. */
    async enter(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        dungeon: GameMap,
        spawnId: string,
        instanceId: string = generateEntityId()
    ): Promise<Response> {
        if (player.level < dungeon.minLevel) return Response.error(PlayerErrorCode.LEVEL_TOO_LOW);
        if (!dungeon.dungeon || dungeon.dungeon.chambers.length === 0) {
            return Response.error(MapErrorCode.MAP_NOT_OPEN);
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
        player.beginMapChange(dungeon.code);
        player.moving = false;
        player.clearTarget();
        const message: MapChangeMessage = {
            mapCode: dungeon.code,
            spawnId,
            roomName: WorldRoomName.DUNGEON,
            instanceId: session.instanceId,
        };
        await worldService.savePlayer(room, client.auth.playerId);
        RoomResponse.send(client, WorldMessage.MAP_CHANGE, message);
        return Response.success();
    }

    /** Chết trong dungeon: về làng gần nhất đã đến (không ở lại dungeon). */
    async onPlayerDeath(room: WorldRoom, player: PlayerWorldState): Promise<void> {
        const client = this.clientOf(room, player);
        if (!client) return;
        player.setSpawns(player.x, player.y); // hồi đầy máu trước khi rời
        await this.leave(room, client, player, "town");
    }

    /**
     * Đưa player ra khỏi dungeon: `return` = chỗ đứng trước khi vào; `town` = làng gần nhất đã đến.
     * Xoá session, lưu DB rồi báo client join room `world` của map đích.
     */
    async leave(
        room: WorldRoom,
        client: PlayerClient,
        player: PlayerWorldState,
        destination: "return" | "town"
    ): Promise<Response> {
        const session = player.dungeonSession;
        if (!session) return Response.error(MapErrorCode.DUNGEON_NOT_IN);
        const config = masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG);
        let mapCode = session.returnMapCode;
        let spawn = { x: session.returnX, y: session.returnY };
        try {
            if (destination === "town") {
                mapCode = player.lastTownMapCode ?? config.startMapCode;
                spawn = mapFileService.respawnPointOf(
                    await mapService.getActiveByCodeOrFail(mapCode)
                );
            } else {
                await mapService.getActiveByCodeOrFail(mapCode);
            }
        } catch {
            // Map đích không còn mở: về map khởi đầu.
            mapCode = config.startMapCode;
            spawn = mapFileService.respawnPointOf(await mapService.getActiveByCodeOrFail(mapCode));
        }
        player.placeAt(spawn.x, spawn.y);
        player.dungeonSession = undefined;
        player.beginMapChange(mapCode);
        const message: MapChangeMessage = {
            mapCode,
            spawnId: "default",
            roomName: WorldRoomName.WORLD,
        };
        await worldService.savePlayer(room, client.auth.playerId);
        RoomResponse.send(client, WorldMessage.MAP_CHANGE, message);
        return Response.success();
    }

    private async leaveAll(room: WorldRoom): Promise<void> {
        const instance = room.dungeon;
        if (!instance) return;
        // Đánh dấu để tick không gọi lại.
        instance.markCleared();
        for (const [playerId, player] of room.state.players) {
            const client = room.clientOf(playerId);
            if (client && player.dungeonSession && !player.pendingMapCode) {
                await this.leave(room, client as PlayerClient, player, "return");
            }
        }
    }

    /** Khởi động chamber đầu tiên (đủ người hoặc hết thời gian chờ). */
    private begin(room: WorldRoom): void {
        room.dungeon!.begin(room.clock.elapsedTime);
        this.startChamber(room, 0);
        // Người đã vào trong lúc chờ đứng ở chamber đầu — không cần làm gì thêm.
    }

    private startChamber(room: WorldRoom, index: number): void {
        const instance = room.dungeon!;
        const state = room.state.dungeon!;
        const monsterLevel = dungeonService.dungeonMonsterLevel(
            [...room.state.players.values()].map((player) => player.level),
            instance.config.maxLevel
        );
        // Dọn xác quái chamber trước khỏi state.
        this.removeMonsters(
            room,
            instance.beginChamber(index, room.clock.elapsedTime, monsterLevel)
        );
        state.chamberIndex = index;
        state.phaseCount = instance.chamber.phases.length;
        state.phaseIndex = 0;
        state.exitOpen = false;
        state.monsterLevel = instance.monsterLevel;
        this.refreshGates(room);
    }

    /** Cổng chắn của chamber hiện tại chặn đường tới khi dọn xong; chamber khác / đã dọn thì không có cổng nào. */
    private refreshGates(room: WorldRoom): void {
        const gates = room.dungeon!.refreshBounds(room.map);
        const state = room.state.dungeon;
        if (!state) return;
        state.gates.clear();
        for (const { x, y, w, h } of gates) {
            const gate = new DungeonGateState();
            gate.x = x;
            gate.y = y;
            gate.w = w;
            gate.h = h;
            state.gates.push(gate);
        }
    }

    private async spawnPhase(room: WorldRoom, chamber: DungeonChamber): Promise<void> {
        const instance = room.dungeon!;
        const phase = chamber.phases[instance.spawnedPhases];
        const chamberIndex = instance.chamberIndex;
        instance.spawningPhase = true;
        try {
            const monsters = await monsterWorldService.createMonsters(
                room.map.code,
                phase.monsterSpawns,
                instance.monsterLevel,
                instance.monsters
            );
            // Chamber đã đổi trong lúc await (không nên xảy ra) thì bỏ.
            if (instance.chamberIndex !== chamberIndex) return;
            room.state.monsters.push(...monsters);
            instance.monsters.push(...monsters);
            instance.spawnedPhases++;
        } finally {
            instance.spawningPhase = false;
        }
    }

    private completeChamber(room: WorldRoom, chamber: DungeonChamber): void {
        const instance = room.dungeon!;
        const state = room.state.dungeon!;
        instance.markChamberCleared();
        state.exitOpen = true;
        this.refreshGates(room);

        const message: DungeonChamberClearMessage = {
            chamberIndex: instance.chamberIndex,
            chamberCount: instance.config.chambers.length,
        };
        RoomResponse.broadcast(room, WorldMessage.DUNGEON_CHAMBER_CLEAR, message);

        if (!chamber.isBoss) return;
        instance.markCleared();
        state.cleared = true;
        this.grantToAll(room, instance.config.clearReward);
        this.grantClearLoot(room, instance.config.clearReward);
        for (const [playerId, player] of room.state.players) {
            questWorldService.onEvent(room, playerId, player, {
                type: QuestObjectiveType.CLEAR_DUNGEON,
                targetCode: room.map.code,
            });
        }
        const clear: DungeonClearMessage = {
            leaveInSec: DUNGEON_LEAVE_DELAY_SEC,
            members: [...instance.rewards.values()].map(toMemberMessage),
            leaderPlayerId: instance.leaderPlayerId,
        };
        RoomResponse.broadcast(room, WorldMessage.DUNGEON_CLEAR, clear);
        room.clock.setTimeout(() => {
            void this.leaveAll(room);
        }, DUNGEON_LEAVE_DELAY_SEC * 1000);
    }

    private grantToAll(room: WorldRoom, spec: RewardSpec | undefined): void {
        if (!spec) return;
        for (const [playerId, player] of room.state.players) {
            rewardWorldService.grant(
                room,
                playerId,
                player,
                rewardSpecService.resolveRewardSpec(spec, ItemSource.SYSTEM),
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
        for (const [playerId, player] of room.state.players) {
            const items: ItemReward[] = [];
            for (const drop of reward.dropItems) {
                if (items.length >= freeSlots) break;
                const item = itemService.getByCode(drop.itemCode);
                if (!item || !rewardRollService.rollChance(drop.rate)) continue;
                items.push({
                    itemId: item.id,
                    quantity: rewardRollService.randomInt(drop.min, drop.max),
                });
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
                playerId,
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

    private clientOf(room: WorldRoom, player: PlayerWorldState): PlayerClient | undefined {
        for (const [playerId, state] of room.state.players) {
            if (state === player) {
                return room.clientOf(playerId);
            }
        }
        return undefined;
    }
}

export const dungeonWorldService = new DungeonWorldService();
