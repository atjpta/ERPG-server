import { Response } from "@/core/response/response.js";
import { RoomResponse } from "@/core/response/room-response.js";
import { DialogueSessionsState } from "@/modules/dialogues/state/dialogue-session.state.js";
import type { NpcFunctionCheckRequest } from "@/modules/npcs/types/npc-function-check.type.js";
import { NpcFunctionSessionManager } from "@/rooms/world/modules/content/managers/npc-function-session.manager.js";
import { PartyLootState } from "@/modules/rewards/state/party-loot.state.js";
import { PlayerStateManager } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import { dispatchRpc, type RoomRpcHandlers } from "@/rooms/bus/room-bus.js";
import type {
    PlayerGroupChanged,
    PlayerPartyChanged,
} from "@/modules/player/types/player-sync.type.js";
import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { z } from "zod";
import type { WorldRoomOptions } from "@/rooms/world/types/world-room.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { PlayerStateEvent } from "@/modules/player/enums/player-state.enum.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import { AuthenticatedPlayerRoom } from "@/rooms/authenticated-player.room.js";
import { dungeonExpectationService } from "@/modules/maps/services/dungeon-expectation.service.js";
import { partyDungeonWorldService } from "@/rooms/world/modules/dungeons/services/party-dungeon.world.service.js";
import { skillDeliveryWorldService } from "@/rooms/world/modules/combat/services/skill-delivery.world.service.js";
import { NpcWorldState } from "@/modules/npcs/state/npc.state.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { DungeonInstanceState } from "@/modules/maps/state/dungeon-instance.state.js";
import type { DungeonRewardTally } from "@/rooms/world/modules/dungeons/utils/dungeon-reward.world.util.js";
import { dungeonWorldService } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import type { MonsterWorldState } from "@/modules/monsters/state/monster.state.js";
import { monsterWorldService } from "@/rooms/world/modules/monsters/services/monster.world.service.js";
import { MoveWorldInput } from "@/modules/player/simulation/move.input.js";
import { PlayerWorldState } from "@/modules/player/state/player-world.state.js";
import { playerWorldService } from "@/rooms/world/modules/players/services/player.world.service.js";
import { partyRewardWorldService } from "@/rooms/world/modules/rewards/services/party-reward.world.service.js";
import type { WalletMessage } from "@/rooms/world/modules/rewards/interfaces/reward.world.message.js";
import { WorldState } from "@/modules/world/state/world.state.js";
import { worldEvents } from "@/rooms/world/utils/world-events.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WORLD_TICK_RATE } from "@/modules/world/utils/tick.util.js";
import type { Rewind } from "colyseus";

const RECONNECT_SECONDS = 20;

const messages = await loadRoomMessages(new URL(".", import.meta.url));

@SdkRoom({
    joins: [
        {
            room: "world",
            options: z.object({ serverId: z.string(), mapCode: z.string() }),
            doc: "Room kênh của một map thường (`mapCode`) trong game server `serverId` (phải là server của nhân vật đang đăng nhập).",
        },
        {
            room: "dungeon",
            options: z.object({
                serverId: z.string(),
                mapCode: z.string(),
                instanceId: z.string(),
            }),
            doc: "Room một lượt dungeon; `mapCode` và `instanceId` lấy từ `MapChangeMessage` (server cấp).",
        },
    ],
})
export class WorldRoom extends AuthenticatedPlayerRoom<{
    state: WorldState;
    client: PlayerClient;
    input: MoveWorldInput;
}> {
    messages = messages;
    state = new WorldState();
    readonly tickRate = WORLD_TICK_RATE;

    inputs = this.defineInput(MoveWorldInput, {
        // Giữ tối đa 3.2 giây input ở 40Hz khi server hụt tick; không tin giá trị từ client.
        bufferMaxSize: 128,
        // Sanitize sửa giá trị sai thành giá trị hợp lệ, không reject input.
        sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
    });

    map!: GameMap;
    /** Chỉ có ở room dungeon. */
    dungeon?: DungeonInstanceState<DungeonRewardTally>;

    rewind!: Rewind;
    /** Player đang được lưu và gỡ khỏi room. */
    readonly leavingPlayers = new Set<string>();
    /** Con trỏ chia item luân phiên theo party của room này. */
    readonly partyLoot = new PartyLootState();
    /** Cuộc thoại đang mở của người chơi trong room này. */
    readonly dialogues = new DialogueSessionsState();
    /** Chức năng NPC (cường hoá, tinh hoá...) mà mỗi player đang mở; global hỏi qua rpc `checkNpcFunction` trước khi thực hiện. */
    readonly npcFunctions = new NpcFunctionSessionManager();
    /** Dữ liệu player mà room này đọc / ghi: dùng chung với global room cùng process, hoặc bản sao đồng bộ với global ở process khác. */
    playerStates!: PlayerStateManager;

    private readonly unsubscribers: (() => void)[] = [];

    /** Nhãn "bên dùng" của room này trong `PlayerStateManager.attach` / `detach`. */
    get attachUser() {
        return `world:${this.roomId}`;
    }

    /** Combat báo quái bị hạ (qua room để không import thẳng reward / party). */
    onMonsterKilled(playerId: string, player: PlayerWorldState, monster: MonsterWorldState): void {
        partyRewardWorldService.onMonsterKilled(this, playerId, player, monster);
    }

    /** Lời gọi từ room khác qua `rooms/bus` (global nhờ kiểm tra / đưa thành viên party vào dungeon). */
    private readonly rpcHandlers: RoomRpcHandlers = {
        checkDungeonEntry: async (request: {
            playerId: string;
            dungeonCode: string;
            retry: boolean;
        }) => {
            const result = await partyDungeonWorldService.checkDungeon(
                this,
                request.playerId,
                request.dungeonCode,
                request.retry
            );
            return result;
        },
        enterDungeon: async (request: {
            playerId: string;
            dungeonCode: string;
            instanceId: string;
            spawnId: string;
            retry: boolean;
        }) => {
            const result = await partyDungeonWorldService.enterDungeon(
                this,
                request.playerId,
                request.dungeonCode,
                request.instanceId,
                request.spawnId,
                request.retry
            );
            return result;
        },
    };

    /** Global hỏi: player có đang mở chức năng NPC loại này và còn đứng gần NPC không (trước khi làm việc của chức năng đó). */
    private readonly npcRpcHandlers: RoomRpcHandlers = {
        checkNpcFunction: async (request: NpcFunctionCheckRequest) =>
            this.npcFunctions.check(request.playerId, request.type, this.state.players),
    };

    /** Global (process khác) đổi dữ liệu / party của player mà world này giữ bản sao. */
    private readonly playerRpcHandlers: RoomRpcHandlers = {
        playerGroupChanged: async (message: PlayerGroupChanged) => {
            PlayerStateManager.of(this.serverId).receiveGroup(message);
            return Response.success();
        },
        playerPartyChanged: async (message: PlayerPartyChanged) => {
            PlayerStateManager.of(this.serverId).receiveParty(message);
            return Response.success();
        },
    };

    rpc(method: string, payload: unknown) {
        return dispatchRpc(
            { ...this.rpcHandlers, ...this.playerRpcHandlers, ...this.npcRpcHandlers },
            method,
            payload
        );
    }

    /** Đổi tên giữa phiên: đổi trong dữ liệu player mà room đang giữ. */
    protected override onPlayerRenamed(playerId: string, name: string) {
        const playerState = this.playerStates?.get(playerId);
        if (playerState) this.playerStates.rename(playerState, name);
    }

    async onCreate(options: WorldRoomOptions) {
        this.bindServer(options);
        const { serverId, mapCode, instanceId, persistent } = options;
        this.playerStates = PlayerStateManager.of(serverId);

        const map = await mapService.getActiveByCodeOrFail(mapCode);
        // Dungeon chỉ mở qua room `dungeon` (có instanceId), map thường không được mở bằng instanceId.
        if ((map.type === MapType.DUNGEON) !== (instanceId !== undefined)) {
            throw new Error(`Map "${mapCode}" cannot be opened this way`);
        }
        // NPC không chặn đường: người chơi đi xuyên qua, chỉ collider của map mới là vật cản.
        this.map = map;
        // Room map dựng sẵn lúc server khởi động (không phải dungeon): giữ sống cả khi chưa có ai.
        if (persistent && instanceId === undefined) this.autoDispose = false;
        // Dungeon chứa tối đa bằng một party (cài đặt `party_config.maxMembers`); map thường theo map.
        this.maxClients =
            instanceId !== undefined
                ? masterDataCacheService.get(MasterDataKey.PARTY_CONFIG).maxMembers
                : map.maxPlayersPerChannel;
        this.state.mapCode = map.code;
        this.state.mapWidth = map.width;
        this.state.mapHeight = map.height;
        this.patchRate = 25;

        this.state.npcs.push(
            ...map.npcs
                .filter((placement) => npcService.getByCode(placement.npcCode))
                .map(
                    (placement) =>
                        new NpcWorldState({
                            id: placement.id,
                            code: placement.npcCode,
                            x: placement.x,
                            y: placement.y,
                            direction: placement.direction,
                        })
                )
        );
        if (instanceId !== undefined) {
            const expectation = await dungeonExpectationService.get(serverId, instanceId);
            if (!expectation) {
                console.warn(
                    `[Dungeon] No expectation for instance ${instanceId}: starting without waiting for the party`
                );
            }
            dungeonWorldService.setup(
                this,
                instanceId,
                expectation?.expected ?? [],
                expectation?.leaderPlayerId ?? ""
            );
        }

        const monsters = await monsterWorldService.createMonster(map);

        this.state.monsters.push(...monsters);
        // Lag compensation: client vẽ monster trễ (lerp), nên hit của player được tính theo vị trí
        // monster mà chính client đó đang thấy lúc gửi input ("thấy trúng là trúng").
        this.rewind = this.allowRewindState({ maxRewindMs: 500 }).attachAll(this.state.monsters, {
            fields: ["x", "y"],
        });

        this.setFixedTimestep((ctx) => {
            playerWorldService.chain(this, ctx);
            monsterWorldService.chain(this, ctx.dt);
            // Đạn bay / vùng chờ nổ — sau player và monster để thấy vị trí mới nhất của tick này.
            skillDeliveryWorldService.chain(this, ctx.dt);
            dungeonWorldService.tick(this);
            dialogueWorldService.tick(this);
            this.npcFunctions.tick(this.state.players);
        }, this.tickRate);
        this.unsubscribers.push(
            // Đổi tên giữa phiên: `name` nằm trong state đồng bộ nên mọi client cùng room thấy tên mới ngay.
            this.playerStates.on(PlayerStateEvent.RENAMED, (playerState) => {
                const player = this.state.players.get(playerState.playerId);
                if (player) player.name = playerState.name;
            }),
            // Ví đổi (thưởng, trả phí, thư...): gửi ví mới cho client đang ở room này.
            this.playerStates.on(PlayerStateEvent.WALLET_CHANGED, (playerState) => {
                const client = this.clientOf(playerState.playerId);
                if (!client || !this.state.players.has(playerState.playerId)) return;
                const wallet: WalletMessage = playerState.data.wallet;
                RoomResponse.send(client, WorldMessage.WALLET, wallet);
            }),
            // Túi / trang bị / điểm đổi (từ world hay global): tính lại HP tối đa..., quest "thu thập" cập nhật tiến độ.
            this.playerStates.on(PlayerStateEvent.BAG_CHANGED, (playerState) => {
                const player = this.state.players.get(playerState.playerId);
                if (!player) return;
                player.syncStats();
                const client = this.clientOf(playerState.playerId);
                if (client) worldEvents.emitInventoryChanged(client, player);
            }),
            // Global đổi party của player.
            this.playerStates.on(PlayerStateEvent.PARTY_CHANGED, (playerState) => {
                this.state.players.get(playerState.playerId)?.applyParty(playerState.party);
            })
        );
    }

    async onJoin(client: PlayerClient) {
        const { playerId } = client.auth;
        // Đăng nhập trùng: lưu và gỡ nhân vật của kết nối cũ trước, để `state.players[playerId]` chỉ có một chủ.
        if (this.sessionOf.has(playerId)) await worldService.releasePlayer(this, playerId);
        this.sessionOf.set(playerId, client.sessionId);
        let playerState: PlayerState | undefined;
        try {
            playerState = await this.playerStates.attach(playerId, this.attachUser);
            const snapshot = playerState.data;
            const dungeon = this.dungeon;
            if (dungeon) {
                // Room dungeon chỉ nhận player có lượt vào đúng instance này (DB giữ map cũ để mất kết nối thì ra ngoài).
                const session = snapshot.dungeonSession;
                if (
                    session?.instanceId !== dungeon.instanceId ||
                    session.dungeonCode !== this.map.code
                ) {
                    throw new Error(
                        `Player has no session in dungeon instance "${dungeon.instanceId}"`
                    );
                }
            } else if (snapshot.mapCode !== this.map.code) {
                throw new Error(`Player is on map "${snapshot.mapCode}", not "${this.map.code}"`);
            }

            const joined = new PlayerWorldState({ playerState });
            // Lượt dungeon cũ còn sót (server tắt giữa chừng) thì bỏ, lần lưu sau sẽ xoá khỏi DB.
            joined.dungeonSession = dungeon ? (snapshot.dungeonSession ?? undefined) : undefined;
            if (this.map.type === MapType.TOWN) joined.lastTownMapCode = this.map.code;
            this.state.players.set(playerId, joined);
            // Vị trí / HP mới nhất của player này để runtime lưu (autosave, rời room, đổi map).
            playerState.setCapture(this.attachUser, () =>
                this.state.players.get(playerId)?.capturePlace(this.map.code)
            );
        } catch (err) {
            if (this.sessionOf.get(playerId) === client.sessionId) this.sessionOf.delete(playerId);
            if (playerState) await this.playerStates.detach(playerId, this.attachUser);
            throw err;
        }

        // Subscribe kick (ban/xoá/logout) + đá kết nối cũ của cùng player ở mọi room/process.
        await this.registerOnlinePlayer(client);

        const player = this.state.players.get(playerId);
        if (player) {
            // Đã đến map này → về sau teleport tới được.
            player.playerState.visitMap(this.map.code);
            if (this.dungeon !== undefined) dungeonWorldService.onPlayerJoined(this, player);
            // Báo vị trí (bạn bè, party, chat cùng map dùng) — ghi đè room cũ khi đổi map.
            this.playerStates.setPresence(player.playerState, {
                worldRoomId: this.roomId,
                mapCode: this.map.code,
                instanceId: this.dungeon?.instanceId,
                seenAt: this.clock.currentTime,
            });
            player.applyParty(player.playerState.party);
            // Không đẩy snapshot: ví / quest / dấu NPC do client tự xin (`getWallet`, `getQuestList`...), push chỉ gửi khi đổi.
            // Quest hằng ngày giao trước để `getQuestList` đã thấy chúng.
            questWorldService.ensureDaily(this, playerId, player);
        }
    }

    async onDrop(client: PlayerClient) {
        // Mất mạng (hay gặp trên mobile) — giữ chỗ cho reconnect. Không có input mới thì
        // `next()` trả undefined → player tự đứng yên.
        await this.allowReconnection(client, RECONNECT_SECONDS);
    }

    async onReconnect(client: PlayerClient) {
        await this.verifyReconnect(client);
    }

    async onLeave(client: PlayerClient) {
        await this.unregisterOnlinePlayer(client);
        // Kết nối đã bị thay bởi lần đăng nhập mới thì nhân vật không còn của nó (đã release lúc join).
        if (this.sessionOf.get(client.auth.playerId) !== client.sessionId) return;
        await worldService.releasePlayer(this, client.auth.playerId);
    }

    async onDispose() {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
        await worldService.disposeRoom(this);
        this.dispatcher.stop();
    }
}
