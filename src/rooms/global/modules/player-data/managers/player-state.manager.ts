import { busWorldNotifier } from "@/rooms/bus/player-bus.js";
import { ItemErrorCode } from "@/modules/items/enums/item-error-code.enum.js";
import { PlayerErrorCode } from "@/modules/player/enums/player-error-code.enum.js";
import type {
    PlayerAttachRequest,
    PlayerDetachRequest,
    PlayerPresenceRequest,
    PlayerReplicaSnapshot,
    PlayerWriteAck,
    PlayerWriteRejection,
} from "@/modules/player/types/player-sync.type.js";
import { randomUUID } from "node:crypto";
import { CommonCode } from "@/core/enums/common-code.enum.js";
import { Response } from "@/core/response/response.js";
import { BusGlobalPlayerApi } from "@/rooms/bus/player-bus.js";
import type { GlobalPlayerApi } from "@/modules/player/types/global-player-api.type.js";
import type {
    PlayerGroupChanged,
    PlayerGroupData,
    PlayerPartyChanged,
    PlayerSyncRequest,
    PlayerWriteRequest,
} from "@/modules/player/types/player-sync.type.js";
import type {
    PlayerStateOwner,
    TransactOptions,
} from "@/modules/player/types/player-state-owner.type.js";
import { EventEmitter } from "node:events";
import { DateTime } from "luxon";
import { type Queryable } from "@/configs/postgres.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { PlayerDatas } from "@/modules/player/entities/player-data.entity.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { playerService } from "@/modules/player/services/player.service.js";
import { WalletState } from "@/modules/player/state/wallet.state.js";
import type { GrantOutcome } from "@/modules/player/types/inventory.type.js";
import type { PlayerChangeOp } from "@/modules/player/types/player-change.type.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import {
    ALL_PLAYER_GROUPS,
    GROUP_EVENT,
    PLAYER_GROUP_COLUMNS,
} from "@/modules/player/constants/player-state.constant.js";
import { PlayerDataGroup, PlayerStateEvent } from "@/modules/player/enums/player-state.enum.js";
import { PlayerState } from "@/modules/player/state/player.state.js";
import type { PlayerPartyState, PlayerPresence } from "@/modules/player/types/player-state.type.js";
import {
    PlayerStateConflictError,
    PlayerGoneError,
} from "@/modules/player/types/player-state-error.type.js";

/** Thưởng kill/thu thập được gom lại tối đa chừng này rồi lưu một lần. */
export const CRITICAL_FLUSH_MS = 500;
const DEFAULT_AUTOSAVE_SECONDS = 30;
/** Nhịp kiểm tra xem player nào tới lượt autosave. */
const AUTOSAVE_TICK_MS = 1000;
const MAX_TRANSACT_ATTEMPTS = 3;
/** Nhóm `transact` ghi mặc định. */
const DEFAULT_TRANSACT_GROUPS = [PlayerDataGroup.WALLET, PlayerDataGroup.BAG] as const;
/** Nhóm world sửa tại chỗ (không qua `mutate`): phát hiện thay đổi bằng cách so với lần lưu trước. */
const WATCHED_GROUPS = [PlayerDataGroup.PROGRESS] as const;

/** Nhịp kiểm tra xem bản sao nào tới lượt sao lưu lên global. */
const SYNC_TICK_MS = 1000;
/** Tiến độ lưu sớm (lên level, trả quest) được gom lại chừng này rồi gửi một lần. */
const PROGRESS_SOON_MS = 300;
const MAX_ATTEMPTS = 4;
const ATTACH_ATTEMPTS = 5;
const RETRY_BASE_MS = 200;

/** Cột đồng bộ một chiều world → global (world là bên ghi). */
const WORLD_OWNED = [PlayerDataGroup.PROGRESS, PlayerDataGroup.PLACE] as const;

const roomOf = (user: string) => user.slice(user.indexOf(":") + 1);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const groupJson = (data: PlayerSavedState, group: PlayerDataGroup) =>
    JSON.stringify(PLAYER_GROUP_COLUMNS[group].map((column) => data[column]));

const groupData = (data: PlayerSavedState, group: PlayerDataGroup): PlayerGroupData => {
    const result: Record<string, unknown> = {};
    for (const column of PLAYER_GROUP_COLUMNS[group])
        result[column] = structuredClone(data[column]);
    return result as PlayerGroupData;
};

interface ReplicaMeta {
    /** World room hiện giữ player (để global biết ai được ghi). */
    worldRoomId: string;
    /** Chuỗi thao tác gửi lên global, tuần tự theo player. */
    queue: Promise<unknown>;
    /** Số lần ghi (credit / debit / ops) đã áp tại chỗ nhưng global chưa xác nhận. */
    pending: number;
    /** Giá trị mới nhất global gửi xuống trong lúc còn `pending`; áp khi hết `pending`. */
    stash: Partial<Record<PlayerDataGroup, PlayerGroupData>>;
    lastProgress: string;
    lastPlace: string;
    nextSyncAt: number;
    progressTimer?: NodeJS.Timeout;
}

/** Số `eventId` gần nhất mỗi player được nhớ để gửi lại không áp hai lần. */
const ACK_MEMORY = 64;

/** Cách global báo cho world room ở process khác (mặc định qua `rooms/bus`). */
export interface WorldNotifier {
    groupChanged(worldRoomId: string, message: PlayerGroupChanged): void;
    partyChanged(worldRoomId: string, message: PlayerPartyChanged): void;
}

const worldUser = (worldRoomId: string) => `world:${worldRoomId}`;

/** Ném trong `transact` để huỷ (rollback) mà không coi là lỗi: `transact` trả `value`. */
export class TransactAbort<T> {
    constructor(readonly value: T) {}
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Một object `PlayerState` cho mỗi player online trong process (= một game server), world và global cùng đọc/ghi.
 *
 * - `attach`/`detach`: mỗi bên dùng (`user`) gắn vào khi bắt đầu, gỡ khi xong; bên cuối gỡ thì lưu lần cuối rồi bỏ object.
 * - Thay đổi một bước, đồng bộ: `mutate` (không `await` giữa kiểm tra và ghi).
 * - Thay đổi nhiều bước / cần ghi DB ngay: `transact` (bản nháp + một transaction DB, thành công mới thay vào object thật).
 * - Lưu: thay đổi quan trọng ghi ngay (transact) hoặc gom ≤ 500 ms (`mutate(..., critical)`), còn lại autosave theo chu kỳ,
 *   chỉ ghi các nhóm dirty trong một câu UPDATE có khoá `revision`.
 */
export class PlayerStateManager implements PlayerStateOwner {
    private readonly states = new Map<string, PlayerState>();
    private readonly queues = new Map<string, Promise<unknown>>();
    private readonly flushTimers = new Map<string, NodeJS.Timeout>();
    private readonly emitter = new EventEmitter();
    private autosaveTimer?: NodeJS.Timeout;

    // Phía world (chỉ dùng khi có `upstream`)
    private readonly metas = new Map<string, ReplicaMeta>();
    private readonly attaching = new Map<string, Promise<unknown>>();
    private syncTimer?: NodeJS.Timeout;

    private static readonly remoteManagers = new Map<string, PlayerStateManager>();

    /** Bản sao dữ liệu player của game server `serverId` trong process này (mọi world room của server đó dùng chung). */
    static of(serverId: string): PlayerStateManager {
        let manager = PlayerStateManager.remoteManagers.get(serverId);
        if (!manager) {
            manager = new PlayerStateManager(new BusGlobalPlayerApi(serverId));
            PlayerStateManager.remoteManagers.set(serverId, manager);
        }
        return manager;
    }

    /** Tắt process: sao lưu mọi bản sao của world lên global. */
    static async flushAllRemote(): Promise<void> {
        await Promise.all(
            [...PlayerStateManager.remoteManagers.values()].map((manager) => manager.flushAll())
        );
    }

    /**
     * Không có `upstream` = dữ liệu chính (global room giữ, nạp / lưu DB). Có `upstream` = bản sao phía world, gọi global qua
     * `GlobalPlayerApi` (xem phần "Phía world" bên dưới).
     */
    // Phía global của world ở process khác (chỉ dùng khi không có `upstream`)
    /** playerId -> world room (ở process khác) đang giữ bản sao. */
    private readonly worlds = new Map<string, string>();
    private readonly acks = new Map<string, Map<string, Response<PlayerWriteAck>>>();
    /** Player đang được `hostWrite` ghi: các sự kiện phát ra do chính lần ghi đó không đẩy ngược về world (ack đã mang giá trị mới). */
    private readonly applying = new Set<string>();

    constructor(
        private readonly upstream?: GlobalPlayerApi,
        private readonly notifier: WorldNotifier = busWorldNotifier
    ) {
        this.emitter.setMaxListeners(0);
        if (upstream) return;
        // Dữ liệu chính: đẩy thay đổi của global xuống world ở process khác.
        this.on(PlayerStateEvent.WALLET_CHANGED, (playerState) =>
            this.hostForward(playerState, PlayerDataGroup.WALLET)
        );
        this.on(PlayerStateEvent.BAG_CHANGED, (playerState) =>
            this.hostForward(playerState, PlayerDataGroup.BAG)
        );
        this.on(PlayerStateEvent.PARTY_CHANGED, (playerState) => {
            const worldRoomId = this.worlds.get(playerState.playerId);
            if (!worldRoomId) return;
            this.notifier.partyChanged(worldRoomId, {
                playerId: playerState.playerId,
                party: playerState.party ? { ...playerState.party } : undefined,
            });
        });
    }

    /** Chạy `task` sau khi mọi thao tác trước đó của `playerId` xong. */
    exclusive<T>(playerId: string, task: () => Promise<T>): Promise<T> {
        const previous = this.queues.get(playerId) ?? Promise.resolve();
        const run: Promise<T> = previous.then(task, task);
        const tail = run.catch((): undefined => undefined);
        this.queues.set(playerId, tail);
        void tail.then(() => {
            if (this.queues.get(playerId) === tail) this.queues.delete(playerId);
        });
        return run;
    }

    get(playerId: string): PlayerState | undefined {
        return this.states.get(playerId);
    }

    all(): IterableIterator<PlayerState> {
        return this.states.values();
    }

    on<T = undefined>(
        event: PlayerStateEvent,
        listener: (playerState: PlayerState, detail: T) => void
    ) {
        this.emitter.on(event, listener);
        return () => this.emitter.off(event, listener);
    }

    emit(event: PlayerStateEvent, playerState: PlayerState, detail?: unknown) {
        // Một listener lỗi không được làm hỏng thao tác đã thành công.
        for (const listener of this.emitter.listeners(event)) {
            try {
                listener(playerState, detail);
            } catch (error) {
                console.error(`[PlayerStateManager] ${event} listener failed`, error);
            }
        }
    }

    /** World room mới nhận player (vào game / đổi map): ghi đè vị trí cũ. */
    setPresence(playerState: PlayerState, presence: PlayerPresence) {
        if (this.upstream) return this.setPresenceRemote(playerState, presence);
        const previous = playerState.presence;
        playerState.presence = presence;
        this.emit(PlayerStateEvent.PRESENCE_CHANGED, playerState, { previous, changingMap: false });
    }

    /** World room cũ báo đã rời; chỉ tính khi vẫn là room hiện tại của player (đổi map thì room mới đã ghi đè). */
    clearPresence(playerState: PlayerState, worldRoomId: string, changingMap: boolean) {
        if (this.upstream) return this.clearPresenceRemote(playerState, worldRoomId, changingMap);
        const previous = playerState.presence;
        if (previous?.worldRoomId !== worldRoomId) return;
        playerState.presence = undefined;
        this.emit(PlayerStateEvent.PRESENCE_CHANGED, playerState, { previous, changingMap });
    }

    /** Player đổi tên giữa phiên (tên mới đã ghi DB): đặt vào runtime một lần rồi báo các room; gọi lại với cùng tên là no-op. */
    rename(playerState: PlayerState, name: string) {
        if (playerState.name === name) return;
        playerState.name = name;
        this.emit(PlayerStateEvent.RENAMED, playerState);
    }

    /** Mọi player cùng map với `playerId` (cùng `mapCode`, và cùng instance nếu là dungeon), gồm cả chính họ. */
    onSameMap(playerId: string): string[] {
        const me = this.states.get(playerId)?.presence;
        if (!me) return [];
        return [...this.states.values()]
            .filter(
                (other) =>
                    other.presence?.mapCode === me.mapCode &&
                    other.presence.instanceId === me.instanceId
            )
            .map((other) => other.playerId);
    }

    /** Global đổi party của player (`undefined` = không ở party nào) hoặc cách chia loot. */
    setParty(playerState: PlayerState, party: PlayerPartyState | undefined) {
        playerState.party = party;
        this.emit(PlayerStateEvent.PARTY_CHANGED, playerState);
    }

    /** Gắn `user` vào dữ liệu của player; bên đầu tiên nạp từ DB (kiểm tra ban/xoá), các bên sau nhận lại đúng object đang có. */
    attach(playerId: string, user: string): Promise<PlayerState> {
        if (this.upstream) return this.attachRemote(playerId, user);
        return this.exclusive(playerId, async () => {
            let playerState = this.states.get(playerId);
            if (!playerState) {
                playerState = await this.load(playerId);
                // Lệch ngẫu nhiên trong một chu kỳ: nhiều người vào cùng lúc cũng không dồn autosave vào cùng một nhịp.
                playerState.nextAutosaveAt = Date.now() + Math.random() * this.autosaveIntervalMs();
                this.states.set(playerId, playerState);
                this.startAutosave();
            }
            playerState.users.add(user);
            return playerState;
        });
    }

    /** Gỡ `user`; không còn bên dùng nào thì lưu lần cuối rồi giải phóng. Gỡ user chưa gắn là no-op. */
    detach(playerId: string, user: string): Promise<void> {
        if (this.upstream) return this.detachRemote(playerId, user);
        return this.exclusive(playerId, async () => {
            const playerState = this.states.get(playerId);
            if (!playerState?.users.delete(user)) return;
            if (playerState.users.size > 0) return;
            try {
                await this.save(playerState);
            } finally {
                this.release(playerState);
            }
        });
    }

    /**
     * Sửa runtime đồng bộ. `critical` = lưu sớm (≤ 500 ms) thay vì đợi autosave. Nếu đang có `transact` chạy cho nhóm này,
     * thay đổi được áp dụng lại lên dữ liệu mới sau khi transact thành công nên không bị mất.
     */
    mutate<T>(
        playerState: PlayerState,
        group: PlayerDataGroup,
        change: (data: PlayerSavedState) => T,
        options: { critical?: boolean; stats?: boolean } = {}
    ): T {
        if (this.upstream) return this.mutateRemote(playerState, group, change, options);
        const result = change(playerState.data);
        if (playerState.transactGroups?.has(group)) playerState.replay?.push({ group, change });
        this.afterChange(playerState, group, options.critical ?? false, options.stats ?? false);
        return result;
    }

    /** Cộng tiền vào ví (thưởng); lưu sớm ≤ 500 ms. */
    credit(playerState: PlayerState, currency: readonly CurrencyReward[]) {
        if (this.upstream) return this.creditRemote(playerState, currency);
        this.mutate(
            playerState,
            PlayerDataGroup.WALLET,
            (data) => {
                new WalletState(data.wallet).credit(currency);
            },
            { critical: true }
        );
    }

    /** Trừ tiền khỏi ví; `false` (không đổi gì) nếu không đủ. Lưu sớm ≤ 500 ms. */
    debit(playerState: PlayerState, costs: readonly CurrencyReward[]): boolean {
        if (this.upstream) return this.debitRemote(playerState, costs);
        if (!playerState.canAfford(costs)) return false;
        this.mutate(
            playerState,
            PlayerDataGroup.WALLET,
            (data) => {
                new WalletState(data.wallet).debit(costs);
            },
            { critical: true }
        );
        return true;
    }

    /**
     * Lô thao tác túi / điểm (item rơi, vật phẩm quest, bình thuốc, điểm lên level): kiểm tra cả lô trước, rồi ghi một lần,
     * lưu sớm ≤ 500 ms và phát `BAG_GRANTED` cho từng lần cộng item.
     */
    applyOps(playerState: PlayerState, ops: readonly PlayerChangeOp[]): Response {
        if (this.upstream) return this.applyOpsRemote(playerState, ops);
        if (ops.length === 0) return Response.success();
        const check = playerState.checkOps(ops);
        if (Response.isError(check)) return check;
        const grants: GrantOutcome[] = [];
        this.mutate(
            playerState,
            PlayerDataGroup.BAG,
            () => {
                grants.length = 0;
                playerState.runOps(ops, grants);
            },
            { critical: true }
        );
        for (const grant of grants) this.emit(PlayerStateEvent.BAG_GRANTED, playerState, grant);
        return Response.success();
    }

    /** Tiến độ (level, quest, cờ...) vừa đổi tại chỗ và cần lưu sớm (lên level, trả quest). */
    saveProgressSoon(playerState: PlayerState) {
        if (this.upstream) return this.saveProgressSoonRemote(playerState);
        this.afterChange(playerState, PlayerDataGroup.PROGRESS, true);
    }

    /** Báo một nhóm đã đổi (sửa tại chỗ ngoài `mutate`), phát sự kiện và đặt lịch lưu sớm nếu `critical`. */
    markChanged(playerState: PlayerState, group: PlayerDataGroup, critical = false) {
        this.afterChange(playerState, group, critical, false);
    }

    /**
     * Thao tác nhiều bước: sửa bản nháp (đồng bộ) + việc DB cùng transaction (`tx`); thành công thì lưu các nhóm đã đổi (cùng
     * các nhóm đang dirty) trong chính transaction đó rồi mới thay bản nháp vào object thật. `fn` ném lỗi → rollback,
     * object thật giữ nguyên; ném `TransactAbort` → rollback và `transact` trả giá trị đó. `fn` có thể bị chạy lại nếu dòng
     * DB bị ghi từ bên ngoài, nên không được có tác dụng phụ ngoài `tx`.
     */
    transact<T>(
        playerId: string,
        fn: (draft: PlayerSavedState, tx: Queryable, playerState: PlayerState) => Promise<T>,
        options: TransactOptions = {}
    ): Promise<T> {
        if (this.upstream) {
            throw new Error("A world-side copy cannot transact: data is owned by the global room");
        }
        return this.exclusive(playerId, async () => {
            const playerState = this.states.get(playerId);
            if (!playerState) throw new Error(`Player ${playerId} is not online`);
            const groups = new Set(options.groups ?? DEFAULT_TRANSACT_GROUPS);
            for (let attempt = 1; ; attempt++) {
                try {
                    return await this.transactOnce(playerState, fn, groups);
                } catch (error) {
                    if (!(error instanceof PlayerStateConflictError)) throw error;
                    if (attempt >= MAX_TRANSACT_ATTEMPTS) throw error;
                    if (!(await this.reconcile(playerState)))
                        throw new PlayerGoneError(playerState.playerId);
                }
            }
        });
    }

    /** Đánh dấu các nhóm đã đổi (sửa tại chỗ) và lưu ngay. */
    save(playerId: string, groups: readonly PlayerDataGroup[]): Promise<void>;
    save(playerState: PlayerState): Promise<void>;
    save(target: string | PlayerState, groups?: readonly PlayerDataGroup[]): Promise<void> {
        if (this.upstream)
            return this.saveRemote(typeof target === "string" ? target : target.playerId);
        if (typeof target !== "string") return this.saveDirty(target);
        return this.exclusive(target, async () => {
            const playerState = this.states.get(target);
            if (!playerState) return;
            for (const group of groups ?? []) playerState.markDirty(group, true);
            await this.saveDirty(playerState);
        });
    }

    /** Lưu các nhóm dirty của một player ngay. */
    flush(playerId: string): Promise<void> {
        return this.exclusive(playerId, async () => {
            const playerState = this.states.get(playerId);
            if (playerState) await this.saveDirty(playerState);
        });
    }

    /** Tắt server: lưu mọi player đang giữ. Một player lỗi không chặn các player còn lại. */
    async flushAll(): Promise<void> {
        if (this.upstream) return this.flushAllRemote();
        this.stopAutosave();
        await Promise.all(
            [...this.states.keys()].map((playerId) =>
                this.flush(playerId).catch((error) => {
                    console.error(`[PlayerStateManager] final save failed for ${playerId}`, error);
                })
            )
        );
    }

    /** Autosave các player đã tới lượt (`nextAutosaveAt <= now`); mỗi người lưu xong thì hẹn lại sau một chu kỳ. */
    autosaveDue(now = Date.now()): Promise<void> {
        const interval = this.autosaveIntervalMs();
        const due = [...this.states.values()].filter(
            (playerState) => playerState.nextAutosaveAt <= now
        );
        for (const playerState of due) playerState.nextAutosaveAt = now + interval;
        return this.autosave(due);
    }

    /** Autosave mọi player ngay (không theo lượt): chụp vị trí từ world, lưu các nhóm dirty. */
    autosaveOnce(): Promise<void> {
        return this.autosave([...this.states.values()]);
    }

    private async autosave(states: readonly PlayerState[]): Promise<void> {
        await Promise.all(
            states.map((playerState) =>
                this.exclusive(playerState.playerId, () => this.saveDirty(playerState)).catch(
                    (error) => {
                        console.error(
                            `[PlayerStateManager] autosave failed for ${playerState.playerId}`,
                            error
                        );
                    }
                )
            )
        );
    }

    /** Quên mọi object mà không lưu (dùng trong test mô phỏng crash). */
    dropAllWithoutSaving() {
        this.stopSyncTimer();
        for (const meta of this.metas.values()) {
            if (meta.progressTimer) clearTimeout(meta.progressTimer);
        }
        this.metas.clear();
        this.attaching.clear();
        this.stopAutosave();
        for (const timer of this.flushTimers.values()) clearTimeout(timer);
        this.flushTimers.clear();
        this.states.clear();
    }

    private async load(playerId: string): Promise<PlayerState> {
        const snapshot = await playerService.getPlayableSnapshotOrFail(playerId);
        const data = {} as Record<string, unknown>;
        for (const columns of Object.values(PLAYER_GROUP_COLUMNS)) {
            for (const column of columns) data[column] = structuredClone(snapshot[column]);
        }
        const playerState = new PlayerState(
            this,
            playerId,
            snapshot.name,
            snapshot.classId,
            classService.getById(snapshot.classId)?.code ?? "",
            data as PlayerSavedState,
            {
                skills: structuredClone(snapshot.skills),
                hitbox: structuredClone(snapshot.hitbox),
                collider: structuredClone(snapshot.collider),
            },
            snapshot.stateRevision
        );
        this.resetBaseline(playerState, WATCHED_GROUPS);
        return playerState;
    }

    private async transactOnce<T>(
        playerState: PlayerState,
        fn: (draft: PlayerSavedState, tx: Queryable, playerState: PlayerState) => Promise<T>,
        groups: ReadonlySet<PlayerDataGroup>
    ): Promise<T> {
        const draft = playerState.draft();
        playerState.replay = [];
        playerState.transactGroups = groups;
        let flushed: PlayerDataGroup[] = [];
        try {
            const outcome = await withTransaction(async (tx) => {
                const result = await fn(draft, tx, playerState);
                const changed = [...groups].filter((group) =>
                    this.groupDiffers(playerState, draft, group)
                );
                this.detectWatched(playerState);
                // Nhóm khác đang dirty cũng được ghi trong cùng câu UPDATE (lấy từ object thật, nhóm của transact thì từ bản nháp).
                const others = [...playerState.dirty].filter((group) => !groups.has(group));
                const patch = this.patchOf(playerState.data, others);
                Object.assign(patch, this.patchOf(draft, changed));
                for (const group of others) playerState.dirty.delete(group);
                flushed = others;
                const revision = await this.write(playerState, patch, tx);
                return { result, changed, revision };
            });
            const replay = playerState.replay;
            for (const group of outcome.changed) {
                for (const column of PLAYER_GROUP_COLUMNS[group]) {
                    (playerState.data as Record<string, unknown>)[column] = draft[column];
                }
                playerState.dirty.delete(group);
            }
            playerState.revision = outcome.revision;
            // Phát lại thay đổi đồng bộ xảy ra trong lúc chờ DB (chúng đã áp lên dữ liệu cũ vừa bị thay).
            for (const { group, change } of replay) {
                change(playerState.data);
                playerState.markDirty(group);
            }
            this.resetBaseline(playerState, WATCHED_GROUPS);
            if (playerState.dirty.size === 0) playerState.critical = false;
            if (outcome.changed.includes(PlayerDataGroup.BAG)) playerState.refreshStats();
            for (const group of new Set([
                ...outcome.changed,
                ...replay.map((entry) => entry.group),
            ])) {
                this.emitGroup(playerState, group);
            }
            return outcome.result;
        } catch (error) {
            for (const group of flushed) playerState.dirty.add(group);
            if (error instanceof TransactAbort) return error.value as T;
            throw error;
        } finally {
            playerState.replay = undefined;
            playerState.transactGroups = undefined;
        }
    }

    private groupDiffers(
        playerState: PlayerState,
        draft: PlayerSavedState,
        group: PlayerDataGroup
    ) {
        return PLAYER_GROUP_COLUMNS[group].some(
            (column) => !sameValue(draft[column], playerState.data[column])
        );
    }

    /** Các cột của `groups` lấy từ `source`, sao chép sâu (phần `await` sau đó không thấy thay đổi đồng bộ về sau). */
    private patchOf(source: PlayerSavedState, groups: readonly PlayerDataGroup[]) {
        const patch: Record<string, unknown> = {};
        for (const group of groups) {
            for (const column of PLAYER_GROUP_COLUMNS[group]) {
                patch[column] = structuredClone(source[column]);
            }
        }
        return patch;
    }

    /** Một câu UPDATE; trả revision mới. Lệch revision → xung đột. */
    private async write(
        playerState: PlayerState,
        patch: Record<string, unknown>,
        tx: Queryable
    ): Promise<number> {
        if (Object.keys(patch).length === 0) return playerState.revision;
        const row = await PlayerStateRepo.updateIfUnchanged(
            playerState.playerId,
            playerState.revision,
            patch as Partial<PlayerDatas>,
            tx
        );
        if (!row)
            throw new PlayerStateConflictError(`player_states changed for ${playerState.playerId}`);
        await PlayerIdentityRepo.updateById({
            id: playerState.playerId,
            data: { lastPlayedAt: DateTime.now().toJSDate() },
            dbOrTx: tx,
        });
        return row.revision;
    }

    /** Lưu các nhóm dirty (gọi trong `exclusive`). Xung đột revision → gộp theo nhóm rồi thử lại. */
    private async saveDirty(playerState: PlayerState): Promise<void> {
        this.clearFlushTimer(playerState.playerId);
        this.detectWatched(playerState);
        for (let attempt = 1; playerState.dirty.size > 0; attempt++) {
            const groups = [...playerState.dirty];
            // Bỏ cờ trước khi ghi: thay đổi xảy ra trong lúc chờ DB sẽ đặt lại cờ và được lưu ở lần sau.
            const wasCritical = playerState.critical;
            for (const group of groups) playerState.dirty.delete(group);
            playerState.critical = false;
            try {
                const patch = this.patchOf(playerState.data, groups);
                playerState.revision = await withTransaction((tx) =>
                    this.write(playerState, patch, tx)
                );
                this.resetBaseline(playerState, WATCHED_GROUPS);
                return;
            } catch (error) {
                for (const group of groups) playerState.dirty.add(group);
                playerState.critical ||= wasCritical;
                if (
                    !(error instanceof PlayerStateConflictError) ||
                    attempt >= MAX_TRANSACT_ATTEMPTS
                ) {
                    throw error;
                }
                if (!(await this.reconcile(playerState))) {
                    // Nhân vật đã bị xoá khi đang online: bỏ dữ liệu chưa lưu thay vì thử lại mãi.
                    playerState.dirty.clear();
                    playerState.critical = false;
                    console.warn(
                        `[PlayerStateManager] ${playerState.playerId} no longer exists, unsaved data dropped`
                    );
                    return;
                }
            }
        }
    }

    /**
     * Dòng DB bị ghi từ bên ngoài: nhận giá trị DB cho nhóm KHÔNG dirty, giữ nhóm dirty của runtime (runtime thắng, có log).
     * Không bao giờ bỏ thay đổi chưa lưu của người chơi.
     */
    private async reconcile(playerState: PlayerState): Promise<boolean> {
        const row = await PlayerStateRepo.findByPlayerId(playerState.playerId);
        if (!row) return false;
        for (const group of ALL_PLAYER_GROUPS) {
            for (const column of PLAYER_GROUP_COLUMNS[group]) {
                if (playerState.dirty.has(group)) {
                    if (!sameValue(row[column], playerState.data[column])) {
                        console.warn(
                            `[PlayerStateManager] ${playerState.playerId}: ${group}.${column} changed outside, runtime value wins`
                        );
                    }
                    continue;
                }
                (playerState.data as Record<string, unknown>)[column] = row[column];
            }
        }
        playerState.revision = row.revision;
        playerState.refreshStats();
        this.resetBaseline(playerState, WATCHED_GROUPS);
        return true;
    }

    private groupJson(playerState: PlayerState, group: PlayerDataGroup) {
        return JSON.stringify(
            PLAYER_GROUP_COLUMNS[group].map((column) => playerState.data[column])
        );
    }

    private resetBaseline(playerState: PlayerState, groups: readonly PlayerDataGroup[]) {
        for (const group of groups) {
            if (!playerState.dirty.has(group))
                playerState.baseline.set(group, this.groupJson(playerState, group));
        }
    }

    /** Nhóm world sửa tại chỗ: khác lần lưu trước thì coi là dirty. */
    private detectWatched(playerState: PlayerState) {
        for (const group of WATCHED_GROUPS) {
            if (playerState.baseline.get(group) !== this.groupJson(playerState, group)) {
                playerState.markDirty(group);
            }
        }
    }

    /** Sau một thay đổi đồng bộ: đánh dấu dirty, phát sự kiện, đặt lịch lưu sớm nếu quan trọng. */
    private afterChange(
        playerState: PlayerState,
        group: PlayerDataGroup,
        critical: boolean,
        stats = false
    ) {
        playerState.markDirty(group, critical);
        if (stats) playerState.refreshStats();
        this.emitGroup(playerState, group);
        if (critical) this.scheduleFlush(playerState);
    }

    private emitGroup(playerState: PlayerState, group: PlayerDataGroup) {
        const event = GROUP_EVENT[group];
        if (event) this.emit(event, playerState);
    }

    private scheduleFlush(playerState: PlayerState) {
        if (this.flushTimers.has(playerState.playerId)) return;
        const timer = setTimeout(() => {
            this.flushTimers.delete(playerState.playerId);
            this.flush(playerState.playerId).catch((error) => {
                console.error(
                    `[PlayerStateManager] save failed for ${playerState.playerId}`,
                    error
                );
            });
        }, CRITICAL_FLUSH_MS);
        timer.unref();
        this.flushTimers.set(playerState.playerId, timer);
    }

    private clearFlushTimer(playerId: string) {
        const timer = this.flushTimers.get(playerId);
        if (!timer) return;
        clearTimeout(timer);
        this.flushTimers.delete(playerId);
    }

    private release(playerState: PlayerState) {
        this.clearFlushTimer(playerState.playerId);
        this.states.delete(playerState.playerId);
        if (this.states.size === 0) this.stopAutosave();
    }

    private startAutosave() {
        if (this.autosaveTimer) return;
        this.autosaveTimer = setInterval(() => void this.autosaveDue(), AUTOSAVE_TICK_MS);
        this.autosaveTimer.unref();
    }

    private autosaveIntervalMs(): number {
        const seconds =
            masterDataCacheService.get(MasterDataKey.PLAYER_CONFIG)?.autosaveSeconds ??
            DEFAULT_AUTOSAVE_SECONDS;
        return seconds * 1000;
    }

    private stopAutosave() {
        if (!this.autosaveTimer) return;
        clearInterval(this.autosaveTimer);
        this.autosaveTimer = undefined;
    }

    // ============================================================================================================================
    // Phía world (khi có `upstream`): bản sao của dữ liệu player ở process chạy world room, đồng bộ với global qua bus.
    // - Đọc: `PlayerState` dựng từ snapshot của global; global đổi ví / túi / party thì đẩy xuống (`receiveGroup` / `receiveParty`).
    // - Ghi ví / túi: áp tại chỗ ngay (world cần kết quả đồng bộ) rồi gửi lên global bằng `write` có `eventId` (gửi lại an toàn).
    //   Global từ chối (vd tiền đã bị trừ chỗ khác) thì giá trị thật của global đè lên bản sao.
    // - Tiến độ (quest, cờ, level, exp) và vị trí / HP / MP: world là bên ghi, sao lưu lên global mỗi `autosaveSeconds` (lệch nhau giữa
    //   các player), sớm hơn khi lên level / trả quest, và ngay khi đổi map / rời room.
    // ============================================================================================================================

    // ---- gắn / gỡ ---------------------------------------------------------------------------------------------------------------

    private async attachRemote(playerId: string, user: string): Promise<PlayerState> {
        // Hai lần attach cùng lúc (đổi map: room mới vào trước khi room cũ gỡ) chạy tuần tự.
        const previous = this.attaching.get(playerId) ?? Promise.resolve();
        const run = previous
            .catch((): undefined => undefined)
            .then(() => this.attachOnceRemote(playerId, user));
        this.attaching.set(
            playerId,
            run.catch((): undefined => undefined)
        );
        return run;
    }

    private async attachOnceRemote(playerId: string, user: string): Promise<PlayerState> {
        const worldRoomId = roomOf(user);
        // Global room có thể chưa sẵn sàng (vừa khởi động): thử lại vài lần trước khi từ chối vào room.
        let result = await this.upstream.attach({ playerId, worldRoomId });
        for (
            let attempt = 1;
            attempt < ATTACH_ATTEMPTS &&
            Response.isError(result) &&
            result.errorCode === CommonCode.ROOM_UNAVAILABLE;
            attempt++
        ) {
            await sleep(RETRY_BASE_MS * attempt);
            result = await this.upstream.attach({ playerId, worldRoomId });
        }
        if (Response.isError(result))
            throw Object.assign(new Error(result.errorCode), { code: result.errorCode });
        const snapshot = result.data;

        let playerState = this.states.get(playerId);
        const meta = this.metas.get(playerId);
        if (playerState && meta) {
            // Đổi map trong cùng process: dùng lại bản sao đang có, chỉ đổi room hiện tại.
            meta.worldRoomId = worldRoomId;
        } else {
            playerState = new PlayerState(
                this,
                playerId,
                snapshot.name,
                snapshot.classId,
                snapshot.classCode,
                snapshot.data,
                snapshot.extras,
                0
            );
            playerState.party = snapshot.party;
            this.states.set(playerId, playerState);
            this.metas.set(playerId, {
                worldRoomId,
                queue: Promise.resolve(),
                pending: 0,
                stash: {},
                lastProgress: groupJson(playerState.data, PlayerDataGroup.PROGRESS),
                lastPlace: groupJson(playerState.data, PlayerDataGroup.PLACE),
                // Lệch ngẫu nhiên trong một chu kỳ để nhiều người vào cùng lúc không sao lưu cùng một nhịp.
                nextSyncAt: Date.now() + Math.random() * this.autosaveIntervalMs(),
            });
            this.startSyncTimer();
        }
        playerState.users.add(user);
        return playerState;
    }

    private async detachRemote(playerId: string, user: string): Promise<void> {
        const playerState = this.states.get(playerId);
        if (!playerState?.users.delete(user)) return;
        playerState.clearCapture(user);
        const last = playerState.users.size === 0;
        try {
            if (last) await this.syncNow(playerState, true);
        } finally {
            const meta = this.metas.get(playerId);
            // Gỡ sau cùng: hàng đợi gửi lên global phải xong trước khi global bỏ bản của world này.
            await (meta?.queue ?? Promise.resolve()).catch((): undefined => undefined);
            await this.upstream
                .detach({ playerId, worldRoomId: roomOf(user) })
                .catch((error) => console.error("[PlayerStateManager] detach failed", error));
            if (last) this.releaseRemote(playerId);
        }
    }

    private async saveRemote(playerId: string): Promise<void> {
        const playerState = this.states.get(playerId);
        if (playerState) await this.syncNow(playerState, true);
    }

    private setPresenceRemote(playerState: PlayerState, presence: PlayerPresence) {
        const previous = playerState.presence;
        playerState.presence = presence;
        this.emit(PlayerStateEvent.PRESENCE_CHANGED, playerState, { previous, changingMap: false });
        this.enqueue(playerState.playerId, () =>
            this.upstream.presence({
                playerId: playerState.playerId,
                worldRoomId: presence.worldRoomId,
                presence,
            })
        );
    }

    private clearPresenceRemote(
        playerState: PlayerState,
        worldRoomId: string,
        changingMap: boolean
    ) {
        const previous = playerState.presence;
        if (previous?.worldRoomId !== worldRoomId) return;
        playerState.presence = undefined;
        this.emit(PlayerStateEvent.PRESENCE_CHANGED, playerState, { previous, changingMap });
        this.enqueue(playerState.playerId, () =>
            this.upstream.presence({ playerId: playerState.playerId, worldRoomId, changingMap })
        );
    }

    // ---- nhận từ global -----------------------------------------------------------------------------------------------------------

    /** Global đổi một nhóm (ví, túi): áp ngay, hoặc giữ lại tới khi các lần ghi đang chờ xác nhận xong. */
    receiveGroup(message: PlayerGroupChanged) {
        const playerState = this.states.get(message.playerId);
        const meta = this.metas.get(message.playerId);
        if (!playerState || !meta) return;
        if (meta.pending > 0) meta.stash[message.group] = message.data;
        else this.applyGroup(playerState, message.group, message.data);
    }

    receiveParty(message: PlayerPartyChanged) {
        const playerState = this.states.get(message.playerId);
        if (!playerState) return;
        playerState.party = message.party;
        this.emit(PlayerStateEvent.PARTY_CHANGED, playerState);
    }

    // ---- ghi (PlayerStateOwner) ------------------------------------------------------------------------------------------------

    private creditRemote(playerState: PlayerState, currency: readonly CurrencyReward[]) {
        playerState.creditWallet(currency);
        this.emit(PlayerStateEvent.WALLET_CHANGED, playerState);
        this.sendWrite(playerState, { credit: [...currency] });
    }

    private debitRemote(playerState: PlayerState, costs: readonly CurrencyReward[]): boolean {
        if (!playerState.debitWallet(costs)) return false;
        this.emit(PlayerStateEvent.WALLET_CHANGED, playerState);
        this.sendWrite(playerState, { debit: [...costs] });
        return true;
    }

    private applyOpsRemote(playerState: PlayerState, ops: readonly PlayerChangeOp[]): Response {
        if (ops.length === 0) return Response.success();
        const check = playerState.checkOps(ops);
        if (Response.isError(check)) return check;
        playerState.runOps(ops);
        this.emit(PlayerStateEvent.BAG_CHANGED, playerState);
        this.sendWrite(playerState, { ops: [...ops] });
        return Response.success();
    }

    /** Chỉ nhóm world là bên ghi (tiến độ, vị trí); ví / túi phải đi qua `credit` / `debit` / `applyOps`. */
    private mutateRemote<T>(
        playerState: PlayerState,
        group: PlayerDataGroup,
        change: (data: PlayerSavedState) => T,
        options: { critical?: boolean; stats?: boolean }
    ): T {
        if (!(WORLD_OWNED as readonly PlayerDataGroup[]).includes(group)) {
            throw new Error(
                `Replica cannot mutate "${group}" with a closure: use credit / debit / applyOps`
            );
        }
        const result = change(playerState.data);
        playerState.markDirty(group, options.critical);
        if (options.stats) playerState.refreshStats();
        if (options.critical) this.scheduleProgress(playerState);
        return result;
    }

    private saveProgressSoonRemote(playerState: PlayerState) {
        this.scheduleProgress(playerState);
    }

    // ---- gửi lên global -----------------------------------------------------------------------------------------------------------

    /**
     * Sao lưu tiến độ + vị trí lên global. Chỉ gửi nhóm đã đổi từ lần gửi trước; `flush` luôn gửi và bảo global lưu DB ngay.
     * Xong khi global đã nhận (hoặc đã bỏ cuộc sau vài lần thử).
     */
    async syncNow(playerState: PlayerState, flush = false): Promise<void> {
        const meta = this.metas.get(playerState.playerId);
        if (!meta) return;
        if (meta.progressTimer) {
            clearTimeout(meta.progressTimer);
            meta.progressTimer = undefined;
        }
        // Chụp vị trí / HP mới nhất từ world room.
        const captured = playerState.capturePlace?.();
        if (captured) Object.assign(playerState.data, captured);

        const progress = groupJson(playerState.data, PlayerDataGroup.PROGRESS);
        const place = groupJson(playerState.data, PlayerDataGroup.PLACE);
        const request: PlayerSyncRequest = {
            playerId: playerState.playerId,
            worldRoomId: meta.worldRoomId,
            flush,
        };
        if (flush || progress !== meta.lastProgress) {
            request.progress = groupData(playerState.data, PlayerDataGroup.PROGRESS);
        }
        if (flush || place !== meta.lastPlace) {
            request.place = groupData(playerState.data, PlayerDataGroup.PLACE);
        }
        if (!request.progress && !request.place) return;

        const sent = await this.enqueue(playerState.playerId, () => this.upstream.sync(request));
        if (sent) {
            if (request.progress) meta.lastProgress = progress;
            if (request.place) meta.lastPlace = place;
            playerState.dirty.clear();
            playerState.critical = false;
        }
    }

    /** Tắt process: sao lưu mọi player đang giữ. */
    private async flushAllRemote(): Promise<void> {
        this.stopSyncTimer();
        await Promise.all(
            [...this.states.values()].map((playerState) =>
                this.syncNow(playerState, true).catch((error) =>
                    console.error(
                        `[PlayerStateManager] final sync failed for ${playerState.playerId}`,
                        error
                    )
                )
            )
        );
    }

    /** Sao lưu các player đã tới lượt. */
    syncDue(now = Date.now()): Promise<void> {
        const interval = this.autosaveIntervalMs();
        const due = [...this.states.values()].filter(
            (playerState) => (this.metas.get(playerState.playerId)?.nextSyncAt ?? Infinity) <= now
        );
        for (const playerState of due) {
            const meta = this.metas.get(playerState.playerId);
            if (meta) meta.nextSyncAt = now + interval;
        }
        return Promise.all(
            due.map((playerState) =>
                this.syncNow(playerState).catch((error) =>
                    console.error(
                        `[PlayerStateManager] sync failed for ${playerState.playerId}`,
                        error
                    )
                )
            )
        ).then((): undefined => undefined);
    }

    // ---- nội bộ -------------------------------------------------------------------------------------------------------------------

    private sendWrite(
        playerState: PlayerState,
        change: Omit<PlayerWriteRequest, "playerId" | "worldRoomId" | "eventId">
    ) {
        const meta = this.metas.get(playerState.playerId);
        if (!meta) return;
        meta.pending++;
        const request: PlayerWriteRequest = {
            ...change,
            playerId: playerState.playerId,
            worldRoomId: meta.worldRoomId,
            eventId: randomUUID(),
        };
        void this.enqueue(playerState.playerId, async () => {
            const result = await this.upstream.write(request);
            if (!Response.isError(result)) {
                meta.stash = { ...meta.stash, ...result.data.groups };
                return result;
            }
            const rejected = (result.errorData as Partial<PlayerWriteRejection> | undefined)
                ?.groups;
            if (!rejected) return result;
            // Global từ chối lô này: nhận giá trị thật của ví / túi để bỏ phần đã áp thử (đã giao tới nơi, không gửi lại).
            console.warn(
                `[PlayerStateManager] ${playerState.playerId}: global rejected ${request.eventId} (${result.errorCode})`
            );
            meta.stash = { ...meta.stash, ...rejected };
            return Response.success();
        })
            .then(async (delivered) => {
                if (!delivered) await this.resync(playerState, meta);
            })
            .finally(() => {
                meta.pending--;
                if (meta.pending === 0) this.settle(playerState, meta);
            });
    }

    /** Không gửi được lên global sau nhiều lần thử: bỏ phần đã áp thử, lấy lại ví / túi thật của global. */
    private async resync(playerState: PlayerState, meta: ReplicaMeta) {
        const result = await this.upstream.snapshot({
            playerId: playerState.playerId,
            worldRoomId: meta.worldRoomId,
        });
        if (Response.isError(result)) return;
        for (const group of [PlayerDataGroup.WALLET, PlayerDataGroup.BAG]) {
            meta.stash[group] = groupData(result.data.data, group);
        }
    }

    /** Hết lần ghi chờ xác nhận: nhận giá trị thật của global cho các nhóm đã nhận. */
    private settle(playerState: PlayerState, meta: ReplicaMeta) {
        const stash = meta.stash;
        meta.stash = {};
        for (const [group, data] of Object.entries(stash)) {
            this.applyGroup(playerState, group as PlayerDataGroup, data);
        }
    }

    private applyGroup(playerState: PlayerState, group: PlayerDataGroup, data: PlayerGroupData) {
        for (const column of PLAYER_GROUP_COLUMNS[group]) {
            if (column in data) {
                (playerState.data as Record<string, unknown>)[column] = data[column];
            }
        }
        if (group === PlayerDataGroup.BAG) playerState.refreshStats();
        const event = GROUP_EVENT[group];
        if (event) this.emit(event, playerState);
    }

    /**
     * Xếp một lần gọi lên global vào hàng đợi của player (tuần tự); thử lại khi room global chưa trả lời.
     * Trả `true` nếu thành công.
     */
    private enqueue(
        playerId: string,
        send: () => Promise<Response<unknown> | undefined>
    ): Promise<boolean> {
        const meta = this.metas.get(playerId);
        if (!meta) return Promise.resolve(false);
        const run = meta.queue.then(async () => {
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    const result = await send();
                    if (!result || !Response.isError(result)) return true;
                    if (result.errorCode !== CommonCode.ROOM_UNAVAILABLE) return false;
                } catch (error) {
                    console.error(`[PlayerStateManager] ${playerId}: send failed`, error);
                }
                await sleep(RETRY_BASE_MS * attempt);
            }
            console.error(
                `[PlayerStateManager] ${playerId}: gave up after ${MAX_ATTEMPTS} attempts`
            );
            return false;
        });
        meta.queue = run.catch((): undefined => undefined);
        return run;
    }

    private scheduleProgress(playerState: PlayerState) {
        const meta = this.metas.get(playerState.playerId);
        if (!meta || meta.progressTimer) return;
        meta.progressTimer = setTimeout(() => {
            meta.progressTimer = undefined;
            void this.syncNow(playerState).catch((error) =>
                console.error(`[PlayerStateManager] sync failed for ${playerState.playerId}`, error)
            );
        }, PROGRESS_SOON_MS);
        meta.progressTimer.unref();
    }

    private releaseRemote(playerId: string) {
        const meta = this.metas.get(playerId);
        if (meta?.progressTimer) clearTimeout(meta.progressTimer);
        this.metas.delete(playerId);
        this.states.delete(playerId);
        this.attaching.delete(playerId);
        if (this.states.size === 0) this.stopSyncTimer();
    }

    private startSyncTimer() {
        if (this.syncTimer) return;
        this.syncTimer = setInterval(() => void this.syncDue(), SYNC_TICK_MS);
        this.syncTimer.unref();
    }

    private stopSyncTimer() {
        if (!this.syncTimer) return;
        clearInterval(this.syncTimer);
        this.syncTimer = undefined;
    }

    // ============================================================================================================================
    // Phía global của world ở process khác (khi KHÔNG có `upstream`): nhận lời gọi `host*` từ `GlobalRoom.rpc`, áp lên dữ liệu chính
    // ở trên, đẩy thay đổi của global (ví, túi, party) xuống world đang giữ player. World cùng process không đi qua đây.
    // - `hostWrite`: ví / túi, áp ngay, idempotent theo `eventId`; không hợp lệ thì từ chối và trả giá trị thật.
    // - `hostSync`: sao lưu tiến độ + vị trí; chỉ world hiện tại của player được ghi.
    // ============================================================================================================================

    /** Có world ở process khác đang giữ `playerId` không. */
    hasRemoteWorld(playerId: string): boolean {
        return this.worlds.has(playerId);
    }

    async hostAttach(request: PlayerAttachRequest): Promise<Response<PlayerReplicaSnapshot>> {
        const { playerId, worldRoomId } = request;
        try {
            const playerState = await this.attach(playerId, worldUser(worldRoomId));
            this.worlds.set(playerId, worldRoomId);
            return Response.success(this.hostSnapshotOf(playerState));
        } catch (error) {
            return Response.fromThrown(error);
        }
    }

    async hostSnapshot(request: PlayerAttachRequest): Promise<Response<PlayerReplicaSnapshot>> {
        const playerState = this.get(request.playerId);
        if (!playerState) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
        return Response.success(this.hostSnapshotOf(playerState));
    }

    async hostWrite(request: PlayerWriteRequest): Promise<Response<PlayerWriteAck>> {
        const { playerId, eventId } = request;
        const playerState = this.get(playerId);
        if (!playerState) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
        const remembered = this.acks.get(playerId)?.get(eventId);
        if (remembered) return structuredClone(remembered);

        this.applying.add(playerId);
        let ack: Response<PlayerWriteAck>;
        try {
            ack = this.hostApply(playerState, request);
        } finally {
            this.applying.delete(playerId);
        }
        let memory = this.acks.get(playerId);
        if (!memory) this.acks.set(playerId, (memory = new Map()));
        memory.set(eventId, ack);
        if (memory.size > ACK_MEMORY) memory.delete(memory.keys().next().value as string);
        return structuredClone(ack);
    }

    async hostSync(request: PlayerSyncRequest): Promise<Response> {
        const { playerId, worldRoomId } = request;
        const playerState = this.get(playerId);
        if (!playerState) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
        // Chỉ world hiện tại được ghi: room cũ gửi muộn (đã đổi map) sẽ không đè dữ liệu của room mới.
        if (this.worlds.get(playerId) !== worldRoomId) return Response.success();

        const groups: PlayerDataGroup[] = [];
        if (request.progress) {
            this.hostAssign(playerState, PlayerDataGroup.PROGRESS, request.progress);
            groups.push(PlayerDataGroup.PROGRESS);
        }
        if (request.place) {
            this.hostAssign(playerState, PlayerDataGroup.PLACE, request.place);
            groups.push(PlayerDataGroup.PLACE);
        }
        if (request.flush) {
            await this.save(playerId, groups);
        } else {
            for (const group of groups) this.markChanged(playerState, group);
        }
        return Response.success();
    }

    async hostPresence(request: PlayerPresenceRequest): Promise<Response> {
        const playerState = this.get(request.playerId);
        if (!playerState) return Response.error(PlayerErrorCode.PLAYER_OFFLINE);
        if (request.presence) {
            this.setPresence(playerState, request.presence);
        } else {
            this.clearPresence(playerState, request.worldRoomId, request.changingMap ?? false);
        }
        return Response.success();
    }

    async hostDetach(request: PlayerDetachRequest): Promise<Response> {
        const { playerId, worldRoomId } = request;
        if (this.worlds.get(playerId) === worldRoomId) this.worlds.delete(playerId);
        await this.detach(playerId, worldUser(worldRoomId));
        if (!this.get(playerId)) this.acks.delete(playerId);
        return Response.success();
    }

    private hostApply(
        playerState: PlayerState,
        request: PlayerWriteRequest
    ): Response<PlayerWriteAck> {
        const { credit, debit, ops } = request;
        const touched: PlayerDataGroup[] = [];
        if (credit?.length || debit?.length) touched.push(PlayerDataGroup.WALLET);
        if (ops?.length) touched.push(PlayerDataGroup.BAG);

        let failure: Response | undefined;
        if (debit?.length && !playerState.canAfford(debit)) {
            failure = Response.error(ItemErrorCode.CURRENCY_NOT_ENOUGH);
        } else if (ops?.length) {
            failure = playerState.checkOps(ops);
        }
        if (failure && Response.isError(failure)) {
            // Từ chối: không đổi gì; trả giá trị thật để world bỏ phần đã áp thử.
            const rejection: PlayerWriteRejection = {
                groups: this.hostGroupsOf(playerState, [
                    PlayerDataGroup.WALLET,
                    PlayerDataGroup.BAG,
                ]),
            };
            return Response.error(failure.errorCode, rejection);
        }
        if (debit?.length) this.debit(playerState, debit);
        if (ops?.length) this.applyOps(playerState, ops);
        if (credit?.length) this.credit(playerState, credit);
        return Response.success({ groups: this.hostGroupsOf(playerState, touched) });
    }

    private hostSnapshotOf(playerState: PlayerState): PlayerReplicaSnapshot {
        return structuredClone({
            name: playerState.name,
            classId: playerState.classId,
            classCode: playerState.classCode,
            data: playerState.data,
            extras: playerState.extras,
            party: playerState.party,
        });
    }

    private groupDataOf(playerState: PlayerState, group: PlayerDataGroup): PlayerGroupData {
        const data: Record<string, unknown> = {};
        for (const column of PLAYER_GROUP_COLUMNS[group]) {
            data[column] = structuredClone(playerState.data[column]);
        }
        return data as PlayerGroupData;
    }

    private hostGroupsOf(playerState: PlayerState, groups: readonly PlayerDataGroup[]) {
        const result: PlayerWriteAck["groups"] = {};
        for (const group of groups) result[group] = this.groupDataOf(playerState, group);
        return result;
    }

    private hostAssign(playerState: PlayerState, group: PlayerDataGroup, data: PlayerGroupData) {
        for (const column of PLAYER_GROUP_COLUMNS[group]) {
            if (column in data) {
                (playerState.data as Record<string, unknown>)[column] = data[column];
            }
        }
    }

    private hostForward(playerState: PlayerState, group: PlayerDataGroup) {
        const worldRoomId = this.worlds.get(playerState.playerId);
        if (!worldRoomId || this.applying.has(playerState.playerId)) return;
        this.notifier.groupChanged(worldRoomId, {
            playerId: playerState.playerId,
            group,
            data: this.groupDataOf(playerState, group),
        });
    }
}
