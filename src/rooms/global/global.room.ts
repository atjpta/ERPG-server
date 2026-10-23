import { z } from "zod";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import { KICK_CLOSE_CODES, type PlayerClient } from "@/core/rooms/base-player.room.js";
import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import { PlayerRuntimeEvent } from "@/rooms/runtime/modules/player/enums/player-runtime.enum.js";
import type { PresenceChange } from "@/rooms/runtime/modules/player/types/player-runtime.type.js";
import type { GrantOutcome } from "@/modules/player/services/inventory.service.js";
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
import { playerDataGlobalService } from "@/rooms/global/modules/player-data/services/player-data.global.service.js";
import type { GlobalRoomOptions } from "@/rooms/global/types/global-room.type.js";

const RECONNECT_SECONDS = 20;
const PARTY_SWEEP_MS = 30_000;
const MAIL_SWEEP_MS = 3_600_000;
/** Lần chạy bù đầu tiên sau khi room khởi tạo: chờ một chút cho server sẵn sàng. */
const CATCH_UP_DELAY_MS = 5_000;
/** Tối thiểu giữa hai lần gửi `inventoryChanged` / `attributes` cho một player: thay đổi dồn dập (nhặt nhiều món) gộp thành một lần gửi trễ. */
const BAG_PUSH_MIN_INTERVAL_MS = 200;

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

    private readonly unsubscribers: (() => void)[] = [];
    private readonly bagPushTimers = new Map<
        string,
        ReturnType<GlobalRoom["clock"]["setTimeout"]>
    >();
    private readonly lastBagPush = new Map<string, number>();

    /**
     * Global nằm cạnh kết nối world của cùng player (world room mới vào lúc đổi map không được đá nó) nên không bị
     * đá khi đăng nhập trùng ở room khác; vẫn bị đá khi ban/xoá/logout. Đăng nhập trùng ngay trong global được xử lý
     * lúc join (kết nối cũ bị thay).
     */
    protected override shouldKickFor(reason: KickReason) {
        return reason !== KickReason.DUPLICATE_LOGIN;
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
            this.runtime.players.on(PlayerRuntimeEvent.RENAMED, (runtime) => {
                const { playerId, name } = runtime;
                const party = this.runtime.parties.getPartyByPlayerId(playerId);
                if (party?.renameMember(playerId, name)) {
                    partyNotifyGlobalService.broadcastState(this, party);
                }
                friendGlobalService.announceRename(this, playerId, name);
            }),
            // Cho room khác nhờ điều phối cả party vào dungeon.
            this.runtime.registerGlobal({
                launchDungeon: (request) => dungeonLaunchGlobalService.launch(this, request),
            }),
            // Túi / trang bị / điểm đổi (từ global hay từ world: nhặt đồ, thưởng quest...): gửi lại cho client.
            this.runtime.players.on(PlayerRuntimeEvent.BAG_CHANGED, (runtime) =>
                this.scheduleBagPush(runtime.playerId)
            ),
            this.runtime.players.on<GrantOutcome>(
                PlayerRuntimeEvent.BAG_GRANTED,
                (runtime, outcome) => {
                    const client = this.clientOf(runtime.playerId);
                    if (client) inventoryGlobalService.notifyGrant(client, runtime, outcome);
                }
            ),
            this.runtime.players.on<PresenceChange>(
                PlayerRuntimeEvent.PRESENCE_CHANGED,
                (runtime, change) => {
                    const { playerId } = runtime;
                    if (runtime.presence) {
                        friendGlobalService.announcePresence(this, playerId);
                        return;
                    }
                    // Rời world hẳn (không phải đổi map) = rời party.
                    if (change.changingMap) return;
                    const party = this.runtime.parties.getPartyByPlayerId(playerId);
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

    onDispose() {
        for (const unsubscribe of this.unsubscribers) unsubscribe();
        this.unsubscribers.length = 0;
    }

    async onJoin(client: PlayerClient) {
        const { playerId, serverId } = client.auth;
        if (serverId !== this.serverId) throw new Error("Wrong game server");

        await playerService.assertPlayableOrFail(playerId);
        const previous = this.sessionOf.get(playerId);
        this.sessionOf.set(playerId, client.sessionId);
        const runtime = await this.runtime.players.attach(playerId, this.userOf(client));
        if (previous) {
            this.clients.get(previous)?.leave(KICK_CLOSE_CODES[KickReason.DUPLICATE_LOGIN]);
        }
        await this.registerOnlinePlayer(client, { kickDuplicateLogins: false });
        playerDataGlobalService.sendInitial(client, runtime);
        await friendGlobalService.connect(this, playerId);
    }

    async onLeave(client: PlayerClient) {
        await this.unregisterOnlinePlayer(client);
        const { playerId } = client.auth;
        // Kết nối cũ bị thay thế không được xoá phiên của kết nối mới.
        if (this.sessionOf.get(playerId) === client.sessionId) {
            this.sessionOf.delete(playerId);
            friendGlobalService.disconnect(this, playerId);
            this.lastBagPush.delete(playerId);
            inventoryDeltaGlobalService.forget(playerId);
            // Kết nối global kết thúc (sau thời gian chờ reconnect) = rời party.
            const party = this.runtime.parties.getPartyByPlayerId(playerId);
            if (party)
                partyGlobalService.removeMember(this, party, playerId, PartyNotice.MEMBER_LEFT);
        }
        await this.runtime.players.detach(playerId, this.userOf(client));
    }

    async onDrop(client: PlayerClient) {
        // Mất mạng (hay gặp trên mobile) — giữ chỗ cho reconnect; hết hạn mới `onLeave` và rời party.
        await this.allowReconnection(client, RECONNECT_SECONDS);
    }

    async onReconnect(client: PlayerClient) {
        await this.verifyReconnect(client);
    }

    /** Nhãn "bên dùng" của kết nối này trong `PlayerRuntimeService.attach` / `detach`. */
    private userOf(client: PlayerClient) {
        return `global:${client.sessionId}`;
    }

    /** Gửi ngay nếu lâu rồi chưa gửi (thao tác của chính player thấy kết quả trước response), không thì gộp vào một lần gửi trễ. */
    private scheduleBagPush(playerId: string) {
        if (this.bagPushTimers.has(playerId)) return;
        const wait = (this.lastBagPush.get(playerId) ?? 0) + BAG_PUSH_MIN_INTERVAL_MS - Date.now();
        if (wait <= 0) {
            this.pushBag(playerId);
            return;
        }
        this.bagPushTimers.set(
            playerId,
            this.clock.setTimeout(() => {
                this.bagPushTimers.delete(playerId);
                this.pushBag(playerId);
            }, wait)
        );
    }

    private pushBag(playerId: string) {
        const runtime = this.runtime.players.get(playerId);
        if (!runtime) return;
        this.lastBagPush.set(playerId, Date.now());
        playerDataGlobalService.sendChanges(this, runtime);
    }
}
