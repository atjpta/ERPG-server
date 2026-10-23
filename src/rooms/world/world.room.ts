import { Response } from "@/core/utils/response.util.js";
import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { z } from "zod";
import type { WorldRoomOptions } from "@/rooms/world/types/world-room.type.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { WorldMessage } from "@/rooms/world/types/world-message.type.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import type { GameMap } from "@/modules/maps/entities/game-map.entity.js";
import { MapType } from "@/modules/maps/enums/map.enum.js";
import { mapService } from "@/modules/maps/services/map.service.js";
import { teleportService } from "@/modules/maps/services/teleport.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import { npcService } from "@/modules/npcs/services/npc.service.js";
import { PlayerRuntimeEvent } from "@/rooms/runtime/modules/player/enums/player-runtime.enum.js";
import type { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import { AuthenticatedPlayerRoom } from "@/rooms/authenticated-player.room.js";
import { dungeonExpectationService } from "@/rooms/runtime/modules/dungeon/services/dungeon-expectation.service.js";
import { partyDungeonWorldService } from "@/rooms/world/modules/dungeons/services/party-dungeon.world.service.js";
import { skillDeliveryWorldService } from "@/rooms/world/modules/combat/services/skill-delivery.world.service.js";
import { InteractableWorldState } from "@/rooms/world/modules/content/schemas/interactable.world.state.js";
import { NpcWorldState } from "@/rooms/world/modules/content/schemas/npc.world.state.js";
import { dialogueWorldService } from "@/rooms/world/modules/content/services/dialogue.world.service.js";
import { questWorldService } from "@/rooms/world/modules/content/services/quest.world.service.js";
import type { DungeonRuntime } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import { dungeonWorldService } from "@/rooms/world/modules/dungeons/services/dungeon.world.service.js";
import type { MonsterWorldState } from "@/rooms/world/modules/monsters/schemas/monster.world.state.js";
import { monsterWorldService } from "@/rooms/world/modules/monsters/services/monster.world.service.js";
import { MoveWorldInput } from "@/rooms/world/modules/players/schemas/move.world.input.js";
import { PlayerWorldState } from "@/rooms/world/modules/players/schemas/player.world.state.js";
import { playerWorldService } from "@/rooms/world/modules/players/services/player.world.service.js";
import { partyRewardWorldService } from "@/rooms/world/modules/rewards/services/party-reward.world.service.js";
import type { WalletMessage } from "@/rooms/world/modules/rewards/interfaces/reward.world.message.js";
import { WorldState } from "@/rooms/world/schemas/world.state.js";
import { worldEvents } from "@/rooms/world/utils/world-events.js";
import { worldService } from "@/rooms/world/services/world.service.js";
import { WORLD_TICK_RATE } from "@/rooms/world/utils/tick.world.util.js";
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
    dungeon?: DungeonRuntime;

    rewind!: Rewind;
    /** Player đang được lưu và gỡ khỏi room. */
    readonly leavingPlayers = new Set<string>();
    private readonly unsubscribers: (() => void)[] = [];

    /** Nhãn "bên dùng" của room này trong `PlayerRuntimeService.attach` / `detach`. */
    get runtimeUser() {
        return `world:${this.roomId}`;
    }

    /** Combat báo quái bị hạ (qua room để không import thẳng reward / party). */
    onMonsterKilled(playerId: string, player: PlayerWorldState, monster: MonsterWorldState): void {
        partyRewardWorldService.onMonsterKilled(this, playerId, player, monster);
    }

    async onCreate(options: WorldRoomOptions) {
        this.bindServer(options);
        const { serverId, mapCode, instanceId, persistent } = options;

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
                            code: placement.npcCode,
                            x: placement.x,
                            y: placement.y,
                            direction: placement.direction,
                        })
                )
        );
        // Dựng state từ `game_maps.interactables` lúc tạo room.
        this.state.interactables.push(
            ...map.interactables.map(
                (it) =>
                    new InteractableWorldState({
                        id: it.id,
                        kind: it.type,
                        x: it.x,
                        y: it.y,
                        code: it.code,
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
        }, this.tickRate);
        this.unsubscribers.push(
            // Đổi tên giữa phiên: `name` nằm trong state đồng bộ nên mọi client cùng room thấy tên mới ngay.
            this.runtime.players.on(PlayerRuntimeEvent.RENAMED, (runtime) => {
                const player = this.state.players.get(runtime.playerId);
                if (player) player.name = runtime.name;
            }),
            // Cho room khác (global) nhờ kiểm tra / đưa thành viên party vào dungeon.
            this.runtime.registerWorld(this.roomId, {
                checkDungeonEntry: async ({ playerId, dungeonCode, retry }) => {
                    const code = await partyDungeonWorldService.checkDungeon(
                        this,
                        playerId,
                        dungeonCode,
                        retry
                    );
                    return code ? Response.error(code) : Response.success();
                },
                enterDungeon: async ({ playerId, dungeonCode, instanceId, spawnId, retry }) => {
                    const code = await partyDungeonWorldService.enterDungeon(
                        this,
                        playerId,
                        dungeonCode,
                        instanceId,
                        spawnId,
                        retry
                    );
                    return code ? Response.error(code) : Response.success();
                },
            }),
            // Ví đổi (thưởng, trả phí, thư...): gửi ví mới cho client đang ở room này.
            this.runtime.players.on(PlayerRuntimeEvent.WALLET_CHANGED, (runtime) => {
                const client = this.clientOf(runtime.playerId);
                if (!client || !this.state.players.has(runtime.playerId)) return;
                const wallet: WalletMessage = runtime.data.wallet;
                client.sendSuccess(WorldMessage.WALLET, wallet);
            }),
            // Túi / trang bị / điểm đổi (từ world hay global): tính lại HP tối đa..., quest "thu thập" cập nhật tiến độ.
            this.runtime.players.on(PlayerRuntimeEvent.BAG_CHANGED, (runtime) => {
                const player = this.state.players.get(runtime.playerId);
                if (!player) return;
                player.syncStats();
                const client = this.clientOf(runtime.playerId);
                if (client) worldEvents.emitInventoryChanged(client, player);
            }),
            // Global đổi party của player.
            this.runtime.players.on(PlayerRuntimeEvent.PARTY_CHANGED, (runtime) => {
                this.state.players.get(runtime.playerId)?.applyParty(runtime.party);
            })
        );
    }

    async onJoin(client: PlayerClient) {
        const { playerId } = client.auth;
        // Đăng nhập trùng: lưu và gỡ nhân vật của kết nối cũ trước, để `state.players[playerId]` chỉ có một chủ.
        if (this.sessionOf.has(playerId)) await worldService.releasePlayer(this, playerId);
        this.sessionOf.set(playerId, client.sessionId);
        let runtime: PlayerRuntime | undefined;
        try {
            runtime = await this.runtime.players.attach(playerId, this.runtimeUser);
            const snapshot = runtime.data;
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

            const joined = new PlayerWorldState({ runtime });
            // Lượt dungeon cũ còn sót (server tắt giữa chừng) thì bỏ, lần lưu sau sẽ xoá khỏi DB.
            joined.dungeonSession = dungeon ? (snapshot.dungeonSession ?? undefined) : undefined;
            if (this.map.type === MapType.TOWN) joined.lastTownMapCode = this.map.code;
            this.state.players.set(playerId, joined);
            // Vị trí / HP mới nhất của player này để runtime lưu (autosave, rời room, đổi map).
            runtime.setCapture(this.runtimeUser, () =>
                this.state.players.get(playerId)?.capturePlace(this.map.code)
            );
        } catch (err) {
            if (this.sessionOf.get(playerId) === client.sessionId) this.sessionOf.delete(playerId);
            if (runtime) await this.runtime.players.detach(playerId, this.runtimeUser);
            throw err;
        }

        // Subscribe kick (ban/xoá/logout) + đá kết nối cũ của cùng player ở mọi room/process.
        await this.registerOnlinePlayer(client);

        const player = this.state.players.get(playerId);
        if (player) {
            // Đã đến map này → về sau teleport tới được.
            player.flags[teleportService.visitedFlagKey(this.map.code)] = true;
            if (this.dungeon !== undefined) dungeonWorldService.onPlayerJoined(this, player);
            // Báo vị trí (bạn bè, party, chat cùng map dùng) — ghi đè room cũ khi đổi map.
            this.runtime.players.setPresence(player.runtime, {
                worldRoomId: this.roomId,
                mapCode: this.map.code,
                instanceId: this.dungeon?.instanceId,
                seenAt: this.clock.currentTime,
            });
            player.applyParty(player.runtime.party);
            // Túi / thuộc tính do global gửi lúc vào global; ví gửi ở đây.
            const wallet: WalletMessage = player.wallet;
            client.sendSuccess(WorldMessage.WALLET, wallet);
            questWorldService.sendInitial(this, client, player);
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
