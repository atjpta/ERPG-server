import { GlobalMessage } from "@/rooms/global/types/global-message.type.js";
import { RoomResponse } from "@/core/response/room-response.js";
import type { AttributesMessage } from "@/rooms/global/modules/attributes/interfaces/attributes.global.message.js";
import { FriendStateManager } from "@/rooms/global/modules/friend/managers/friend-state.manager.js";
import { PartyStateManager } from "@/rooms/global/modules/party/managers/party-state.manager.js";
import { PlayerStateManager } from "@/rooms/global/modules/player-data/managers/player-state.manager.js";
import { dispatchRpc, type RoomRpcHandlers } from "@/rooms/bus/room-bus.js";
import type {
    PlayerAttachRequest,
    PlayerDetachRequest,
    PlayerPresenceRequest,
    PlayerSyncRequest,
    PlayerWriteRequest,
} from "@/modules/player/types/player-sync.type.js";
import type { DungeonLaunchRequest } from "@/modules/maps/types/dungeon-launch.type.js";
import { z } from "zod";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { KICK_CLOSE_CODES, type PlayerClient } from "@/core/rooms/base-player.room.js";
import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import { PlayerStateEvent } from "@/modules/player/enums/player-state.enum.js";
import type { PresenceChange } from "@/modules/player/types/player-state.type.js";
import type { GrantOutcome } from "@/modules/player/types/inventory.type.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { AuthenticatedPlayerRoom } from "@/rooms/authenticated-player.room.js";
import { PartyNotice } from "@/rooms/global/modules/party/enums/party-notice.enum.js";
import { dungeonLaunchGlobalService } from "@/rooms/global/modules/dungeon-launch/services/dungeon-launch.global.service.js";
import { friendGlobalService } from "@/rooms/global/modules/friend/services/friend.global.service.js";
import { inventoryDeltaGlobalService } from "@/rooms/global/modules/inventory/services/inventory-delta.global.service.js";
import { inventoryGlobalService } from "@/rooms/global/modules/inventory/services/inventory.global.service.js";
import { SweepMailsGlobalCommand } from "@/rooms/global/modules/mail/commands/sweep-mails.global.command.js";
import { SweepOfflineMembersGlobalCommand } from "@/rooms/global/modules/party/commands/sweep-offline-members.global.command.js";
import { partyNotifyGlobalService } from "@/rooms/global/modules/party/services/party-notify.global.service.js";
import { partyGlobalService } from "@/rooms/global/modules/party/services/party.global.service.js";
import type { GlobalRoomOptions } from "@/rooms/global/types/global-room.type.js";

const RECONNECT_SECONDS = 20;
const PARTY_SWEEP_MS = 30_000;
const MAIL_SWEEP_MS = 3_600_000;
/** Lần chạy bù đầu tiên sau khi room khởi tạo: chờ một chút cho server sẵn sàng. */
const CATCH_UP_DELAY_MS = 5_000;
/** Tối thiểu giữa hai lần gửi `inventoryChanged` / `attributes` cho một player: thay đổi dồn dập (nhặt nhiều món) gộp thành một lần gửi trễ. */
const PUSH_MIN_INTERVAL_MS = 200;

const messages = await loadRoomMessages(new URL(".", import.meta.url));

@SdkRoom({
    joins: [
        {
            room: "global",
            options: z.object({ serverId: z.string() }),
            doc: 'Vào bằng `JoinOrCreate("global", { serverId })`: mỗi game server một global room (chat, party); `serverId` phải là server của nhân vật đang đăng nhập. Giữ kết nối suốt phiên chơi, song song với world room; mất mạng được giữ chỗ để reconnect.',
        },
    ],
})
export class GlobalRoom extends AuthenticatedPlayerRoom<{
    client: PlayerClient;
}> {
    messages = messages;
    maxClients = 100_000;
    autoDispose = false;

    /**
     * Dữ liệu chạy của game server này — global là chủ: người chơi online (`players`), party (`parties`), bạn bè (`friends`).
     * World room (cùng process hay không) giữ bản sao và nói chuyện với global qua các hàm `host*` của `players` (xem `PlayerStateManager`).
     */
    readonly players = new PlayerStateManager();
    readonly parties = new PartyStateManager();
    readonly friends = new FriendStateManager();

    private readonly unsubscribers: (() => void)[] = [];
    private readonly pushTimers = new Map<string, ReturnType<GlobalRoom["clock"]["setTimeout"]>>();
    private readonly lastPush = new Map<string, number>();

    /**
     * Global nằm cạnh kết nối world của cùng player (world room mới vào lúc đổi map không được đá nó) nên không bị
     * đá khi đăng nhập trùng ở room khác; vẫn bị đá khi ban/xoá/logout. Đăng nhập trùng ngay trong global được xử lý
     * lúc join (kết nối cũ bị thay).
     */
    protected override shouldKickFor(reason: KickReason) {
        return reason !== KickReason.DUPLICATE_LOGIN;
    }

    /** Lời gọi từ room khác qua `rooms/bus` (world nhờ điều phối cả party vào dungeon). */
    private readonly rpcHandlers: RoomRpcHandlers = {
        launchDungeon: (request: DungeonLaunchRequest) =>
            dungeonLaunchGlobalService.launch(this, request),
    };

    /** World room ở process khác nhờ global giữ dữ liệu player (xem các hàm `host*` của `PlayerStateManager`). */
    private readonly playerRpcHandlers: RoomRpcHandlers = {
        playerAttach: (request: PlayerAttachRequest) => this.players.hostAttach(request),
        playerSnapshot: (request: PlayerAttachRequest) => this.players.hostSnapshot(request),
        playerWrite: (request: PlayerWriteRequest) => this.players.hostWrite(request),
        playerSync: (request: PlayerSyncRequest) => this.players.hostSync(request),
        playerPresence: (request: PlayerPresenceRequest) => this.players.hostPresence(request),
        playerDetach: (request: PlayerDetachRequest) => this.players.hostDetach(request),
    };

    rpc(method: string, payload: unknown) {
        return dispatchRpc({ ...this.rpcHandlers, ...this.playerRpcHandlers }, method, payload);
    }

    async onCreate(options: GlobalRoomOptions) {
        this.bindServer(options);
        this.roomId = options.serverId;
        const { dispatcher } = this;
        this.clock.setInterval(() => {
            void dispatcher.dispatch(new SweepOfflineMembersGlobalCommand());
        }, PARTY_SWEEP_MS);
        // Thư hết hạn: xoá, thư người chơi còn đính kèm được trả về người gửi; lời mời kết bạn hết hạn cũng dọn ở đây.
        this.clock.setInterval(() => {
            void dispatcher.dispatch(new SweepMailsGlobalCommand());
        }, MAIL_SWEEP_MS);
        // Chạy bù ngay sau khi khởi động: thư hết hạn tồn đọng trong lúc server tắt không phải chờ tới chu kỳ kế.
        this.clock.setTimeout(() => {
            void dispatcher.dispatch(new SweepMailsGlobalCommand());
        }, CATCH_UP_DELAY_MS);

        this.unsubscribers.push(
            // Đổi tên giữa phiên: runtime đã có tên mới; báo thành viên party (gửi lại `partyState`) và bạn đang online (`friendChanged` `renamed`).
            this.players.on(PlayerStateEvent.RENAMED, (playerState) => {
                const { playerId, name } = playerState;
                const party = this.parties.getPartyByPlayerId(playerId);
                if (party?.renameMember(playerId, name)) {
                    partyNotifyGlobalService.broadcastState(this, party);
                }
                friendGlobalService.announceRename(this, playerId, name);
            }),
            // Túi / trang bị / điểm đổi (từ global hay từ world: nhặt đồ, thưởng quest...): gửi lại cho client.
            this.players.on(PlayerStateEvent.BAG_CHANGED, (playerState) =>
                this.schedulePush(playerState.playerId)
            ),
            this.players.on<GrantOutcome>(PlayerStateEvent.BAG_GRANTED, (playerState, outcome) => {
                const client = this.clientOf(playerState.playerId);
                if (client) inventoryGlobalService.notifyGrant(client, playerState, outcome);
            }),
            this.players.on<PresenceChange>(
                PlayerStateEvent.PRESENCE_CHANGED,
                (playerState, change) => {
                    const { playerId } = playerState;
                    if (playerState.presence) {
                        friendGlobalService.announcePresence(this, playerId);
                        return;
                    }
                    // Rời world hẳn (không phải đổi map) = rời party.
                    if (change.changingMap) return;
                    const party = this.parties.getPartyByPlayerId(playerId);
                    if (party)
                        partyGlobalService.removeMember(
                            this,
                            party,
                            playerId,
                            PartyNotice.MEMBER_LEFT
                        );
                }
            )
        );
    }

    async onDispose() {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
        await this.players.flushAll();
    }

    /** Đổi tên giữa phiên: đổi trong dữ liệu chính; room nào quan tâm đăng ký `PlayerStateEvent.RENAMED`. */
    protected override onPlayerRenamed(playerId: string, name: string) {
        const playerState = this.players.get(playerId);
        if (playerState) this.players.rename(playerState, name);
    }

    async onJoin(client: PlayerClient) {
        const { playerId, serverId } = client.auth;
        if (serverId !== this.serverId) throw new Error("Wrong game server");

        await playerService.assertPlayableOrFail(playerId);
        const previous = this.sessionOf.get(playerId);
        this.sessionOf.set(playerId, client.sessionId);
        const playerState = await this.players.attach(playerId, this.userOf(client));
        if (previous) {
            this.clients.get(previous)?.leave(KICK_CLOSE_CODES[KickReason.DUPLICATE_LOGIN]);
        }
        await this.registerOnlinePlayer(client, { kickDuplicateLogins: false });
        // Không đẩy snapshot: client tự xin túi / thuộc tính (`getInventory`, `getAttributes`); `push` chỉ gửi phần thay đổi.
        inventoryDeltaGlobalService.reset(playerState);
        await friendGlobalService.connect(this, playerId);
    }

    async onLeave(client: PlayerClient) {
        await this.unregisterOnlinePlayer(client);
        const { playerId } = client.auth;
        // Kết nối cũ bị thay thế không được xoá phiên của kết nối mới.
        if (this.sessionOf.get(playerId) === client.sessionId) {
            this.sessionOf.delete(playerId);
            friendGlobalService.disconnect(this, playerId);
            this.lastPush.delete(playerId);
            inventoryDeltaGlobalService.forget(playerId);
            // Kết nối global kết thúc (sau thời gian chờ reconnect) = rời party.
            const party = this.parties.getPartyByPlayerId(playerId);
            if (party)
                partyGlobalService.removeMember(this, party, playerId, PartyNotice.MEMBER_LEFT);
        }
        await this.players.detach(playerId, this.userOf(client));
    }

    async onDrop(client: PlayerClient) {
        // Mất mạng (hay gặp trên mobile) — giữ chỗ cho reconnect; hết hạn mới `onLeave` và rời party.
        await this.allowReconnection(client, RECONNECT_SECONDS);
    }

    async onReconnect(client: PlayerClient) {
        await this.verifyReconnect(client);
    }

    /** Nhãn "bên dùng" của kết nối này trong `PlayerStateManager.attach` / `detach`. */
    private userOf(client: PlayerClient) {
        return `global:${client.sessionId}`;
    }

    /** Gửi ngay nếu lâu rồi chưa gửi (thao tác của chính player thấy kết quả trước response), không thì gộp vào một lần gửi trễ. */
    private schedulePush(playerId: string) {
        if (this.pushTimers.has(playerId)) return;
        const wait = (this.lastPush.get(playerId) ?? 0) + PUSH_MIN_INTERVAL_MS - Date.now();
        if (wait <= 0) {
            this.push(playerId);
            return;
        }
        this.pushTimers.set(
            playerId,
            this.clock.setTimeout(() => {
                this.pushTimers.delete(playerId);
                this.push(playerId);
            }, wait)
        );
    }

    private push(playerId: string) {
        const playerState = this.players.get(playerId);
        if (!playerState) return;
        this.lastPush.set(playerId, Date.now());
        const client = this.clientOf(playerId);
        if (!client) return;
        // Attributes trước: `diff` cập nhật cả bản "đã gửi" của túi nên phải so attributes khi bản đó còn cũ.
        const attributesChanged = inventoryDeltaGlobalService.attributesChanged(playerState);
        const delta = inventoryDeltaGlobalService.diff(playerState);
        if (delta) RoomResponse.send(client, GlobalMessage.INVENTORY_CHANGED, delta);
        if (attributesChanged) {
            const attributes: AttributesMessage = playerState.getAttributeSummary();
            RoomResponse.send(client, GlobalMessage.ATTRIBUTES, attributes);
        }
    }
}
