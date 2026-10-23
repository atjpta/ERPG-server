import { EventEmitter } from "node:events";
import { DateTime } from "luxon";
import { type Queryable } from "@/configs/postgres.config.js";
import { withTransaction } from "@/core/repositories/base.repository.js";
import { PlayerIdentityRepo } from "@/modules/auth/repositories/player-identity.repository.js";
import { classService } from "@/modules/classes/services/class.service.js";
import { MasterDataKey } from "@/modules/master-data/enums/master-data.enum.js";
import { masterDataCacheService } from "@/modules/master-data/services/master-data-cache.service.js";
import type { PlayerState } from "@/modules/player/entities/player-state.entity.js";
import { PlayerStateRepo } from "@/modules/player/repositories/player-state.repository.js";
import { playerService } from "@/modules/player/services/player.service.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";
import {
    ALL_PLAYER_GROUPS,
    GROUP_EVENT,
    PLAYER_GROUP_COLUMNS,
} from "@/rooms/runtime/modules/player/constants/player-runtime.constant.js";
import {
    PlayerDataGroup,
    PlayerRuntimeEvent,
} from "@/rooms/runtime/modules/player/enums/player-runtime.enum.js";
import { PlayerRuntime } from "@/rooms/runtime/modules/player/runtime/player-runtime.js";
import type {
    PlayerPartyState,
    PlayerPresence,
} from "@/rooms/runtime/modules/player/types/player-runtime.type.js";

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

/** Dòng `player_states` đổi bởi bên ngoài và không gộp được sau vài lần thử. */
export class PlayerRuntimeConflictError extends Error {}

/** Dòng `player_states` không còn (nhân vật bị xoá khi đang online): không còn gì để lưu. */
export class PlayerGoneError extends Error {}

/** Ném trong `transact` để huỷ (rollback) mà không coi là lỗi: `transact` trả `value`. */
export class TransactAbort<T> {
    constructor(readonly value: T) {}
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface TransactOptions {
    /** Các nhóm `fn` được sửa (mặc định ví + túi). */
    groups?: readonly PlayerDataGroup[];
}

/**
 * Một object `PlayerRuntime` cho mỗi player online trong process (= một game server), world và global cùng đọc/ghi.
 *
 * - `attach`/`detach`: mỗi bên dùng (`user`) gắn vào khi bắt đầu, gỡ khi xong; bên cuối gỡ thì lưu lần cuối rồi bỏ object.
 * - Thay đổi một bước, đồng bộ: `mutate` (không `await` giữa kiểm tra và ghi).
 * - Thay đổi nhiều bước / cần ghi DB ngay: `transact` (bản nháp + một transaction DB, thành công mới thay vào object thật).
 * - Lưu: thay đổi quan trọng ghi ngay (transact) hoặc gom ≤ 500 ms (`mutate(..., critical)`), còn lại autosave theo chu kỳ,
 *   chỉ ghi các nhóm dirty trong một câu UPDATE có khoá `revision`.
 */
export class PlayerRuntimeService {
    private readonly runtimes = new Map<string, PlayerRuntime>();
    private readonly queues = new Map<string, Promise<unknown>>();
    private readonly flushTimers = new Map<string, NodeJS.Timeout>();
    private readonly emitter = new EventEmitter();
    private autosaveTimer?: NodeJS.Timeout;

    constructor() {
        this.emitter.setMaxListeners(0);
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

    get(playerId: string): PlayerRuntime | undefined {
        return this.runtimes.get(playerId);
    }

    all(): IterableIterator<PlayerRuntime> {
        return this.runtimes.values();
    }

    on<T = undefined>(
        event: PlayerRuntimeEvent,
        listener: (runtime: PlayerRuntime, detail: T) => void
    ) {
        this.emitter.on(event, listener);
        return () => this.emitter.off(event, listener);
    }

    emit(event: PlayerRuntimeEvent, runtime: PlayerRuntime, detail?: unknown) {
        // Một listener lỗi không được làm hỏng thao tác đã thành công.
        for (const listener of this.emitter.listeners(event)) {
            try {
                listener(runtime, detail);
            } catch (error) {
                console.error(`[PlayerRuntime] ${event} listener failed`, error);
            }
        }
    }

    /** World room mới nhận player (vào game / đổi map): ghi đè vị trí cũ. */
    setPresence(runtime: PlayerRuntime, presence: PlayerPresence) {
        const previous = runtime.presence;
        runtime.presence = presence;
        this.emit(PlayerRuntimeEvent.PRESENCE_CHANGED, runtime, { previous, changingMap: false });
    }

    /** World room cũ báo đã rời; chỉ tính khi vẫn là room hiện tại của player (đổi map thì room mới đã ghi đè). */
    clearPresence(runtime: PlayerRuntime, worldRoomId: string, changingMap: boolean) {
        const previous = runtime.presence;
        if (previous?.worldRoomId !== worldRoomId) return;
        runtime.presence = undefined;
        this.emit(PlayerRuntimeEvent.PRESENCE_CHANGED, runtime, { previous, changingMap });
    }

    /** Player đổi tên giữa phiên (tên mới đã ghi DB): đặt vào runtime một lần rồi báo các room; gọi lại với cùng tên là no-op. */
    rename(runtime: PlayerRuntime, name: string) {
        if (runtime.name === name) return;
        runtime.name = name;
        this.emit(PlayerRuntimeEvent.RENAMED, runtime);
    }

    /** Global đổi party của player (`undefined` = không ở party nào) hoặc cách chia loot. */
    setParty(runtime: PlayerRuntime, party: PlayerPartyState | undefined) {
        runtime.party = party;
        this.emit(PlayerRuntimeEvent.PARTY_CHANGED, runtime);
    }

    /** Gắn `user` vào dữ liệu của player; bên đầu tiên nạp từ DB (kiểm tra ban/xoá), các bên sau nhận lại đúng object đang có. */
    attach(playerId: string, user: string): Promise<PlayerRuntime> {
        return this.exclusive(playerId, async () => {
            let runtime = this.runtimes.get(playerId);
            if (!runtime) {
                runtime = await this.load(playerId);
                // Lệch ngẫu nhiên trong một chu kỳ: nhiều người vào cùng lúc cũng không dồn autosave vào cùng một nhịp.
                runtime.nextAutosaveAt = Date.now() + Math.random() * this.autosaveIntervalMs();
                this.runtimes.set(playerId, runtime);
                this.startAutosave();
            }
            runtime.users.add(user);
            return runtime;
        });
    }

    /** Gỡ `user`; không còn bên dùng nào thì lưu lần cuối rồi giải phóng. Gỡ user chưa gắn là no-op. */
    detach(playerId: string, user: string): Promise<void> {
        return this.exclusive(playerId, async () => {
            const runtime = this.runtimes.get(playerId);
            if (!runtime?.users.delete(user)) return;
            if (runtime.users.size > 0) {
                // Bên còn lại (world mới) có thể đã đăng ký capture; chỉ gỡ capture của chính `user`.
                runtime.clearCapture(user);
                return;
            }
            try {
                await this.save(runtime);
            } finally {
                runtime.clearCapture(user);
                this.release(runtime);
            }
        });
    }

    /**
     * Sửa runtime đồng bộ. `critical` = lưu sớm (≤ 500 ms) thay vì đợi autosave. Nếu đang có `transact` chạy cho nhóm này,
     * thay đổi được áp dụng lại lên dữ liệu mới sau khi transact thành công nên không bị mất.
     */
    mutate<T>(
        runtime: PlayerRuntime,
        group: PlayerDataGroup,
        change: (data: PlayerSavedState) => T,
        options: { critical?: boolean; stats?: boolean } = {}
    ): T {
        const result = change(runtime.data);
        if (runtime.transactGroups?.has(group)) runtime.replay?.push({ group, change });
        this.afterChange(runtime, group, options.critical ?? false, options.stats ?? false);
        return result;
    }

    /** Cộng tiền vào ví (thưởng); lưu sớm ≤ 500 ms. */
    credit(runtime: PlayerRuntime, currency: readonly CurrencyReward[]) {
        this.mutate(
            runtime,
            PlayerDataGroup.WALLET,
            (data) => {
                data.wallet = playerService.creditWallet(data.wallet, currency);
            },
            { critical: true }
        );
    }

    /** Trừ tiền khỏi ví; `false` (không đổi gì) nếu không đủ. Lưu sớm ≤ 500 ms. */
    debit(runtime: PlayerRuntime, costs: readonly CurrencyReward[]): boolean {
        if (!playerService.debitWallet(runtime.data.wallet, costs)) return false;
        this.mutate(
            runtime,
            PlayerDataGroup.WALLET,
            (data) => {
                data.wallet = playerService.debitWallet(data.wallet, costs) ?? data.wallet;
            },
            { critical: true }
        );
        return true;
    }

    /** Tiến độ (level, quest, cờ...) vừa đổi tại chỗ và cần lưu sớm (lên level, trả quest). */
    saveProgressSoon(runtime: PlayerRuntime) {
        this.afterChange(runtime, PlayerDataGroup.PROGRESS, true);
    }

    /** Báo một nhóm đã đổi (sửa tại chỗ ngoài `mutate`), phát sự kiện và đặt lịch lưu sớm nếu `critical`. */
    markChanged(runtime: PlayerRuntime, group: PlayerDataGroup, critical = false) {
        this.afterChange(runtime, group, critical, false);
    }

    /**
     * Thao tác nhiều bước: sửa bản nháp (đồng bộ) + việc DB cùng transaction (`tx`); thành công thì lưu các nhóm đã đổi (cùng
     * các nhóm đang dirty) trong chính transaction đó rồi mới thay bản nháp vào object thật. `fn` ném lỗi → rollback,
     * object thật giữ nguyên; ném `TransactAbort` → rollback và `transact` trả giá trị đó. `fn` có thể bị chạy lại nếu dòng
     * DB bị ghi từ bên ngoài, nên không được có tác dụng phụ ngoài `tx`.
     */
    transact<T>(
        playerId: string,
        fn: (draft: PlayerSavedState, tx: Queryable, runtime: PlayerRuntime) => Promise<T>,
        options: TransactOptions = {}
    ): Promise<T> {
        return this.exclusive(playerId, async () => {
            const runtime = this.runtimes.get(playerId);
            if (!runtime) throw new Error(`Player ${playerId} is not online`);
            const groups = new Set(options.groups ?? DEFAULT_TRANSACT_GROUPS);
            for (let attempt = 1; ; attempt++) {
                try {
                    return await this.transactOnce(runtime, fn, groups);
                } catch (error) {
                    if (!(error instanceof PlayerRuntimeConflictError)) throw error;
                    if (attempt >= MAX_TRANSACT_ATTEMPTS) throw error;
                    if (!(await this.reconcile(runtime)))
                        throw new PlayerGoneError(runtime.playerId);
                }
            }
        });
    }

    /** Đánh dấu các nhóm đã đổi (sửa tại chỗ) và lưu ngay. */
    save(playerId: string, groups: readonly PlayerDataGroup[]): Promise<void>;
    save(runtime: PlayerRuntime): Promise<void>;
    save(target: string | PlayerRuntime, groups?: readonly PlayerDataGroup[]): Promise<void> {
        if (typeof target !== "string") return this.saveDirty(target);
        return this.exclusive(target, async () => {
            const runtime = this.runtimes.get(target);
            if (!runtime) return;
            for (const group of groups ?? []) runtime.markDirty(group, true);
            await this.saveDirty(runtime);
        });
    }

    /** Lưu các nhóm dirty của một player ngay. */
    flush(playerId: string): Promise<void> {
        return this.exclusive(playerId, async () => {
            const runtime = this.runtimes.get(playerId);
            if (runtime) await this.saveDirty(runtime);
        });
    }

    /** Tắt server: lưu mọi player đang giữ. Một player lỗi không chặn các player còn lại. */
    async flushAll(): Promise<void> {
        this.stopAutosave();
        await Promise.all(
            [...this.runtimes.keys()].map((playerId) =>
                this.flush(playerId).catch((error) => {
                    console.error(`[PlayerRuntime] final save failed for ${playerId}`, error);
                })
            )
        );
    }

    /** Autosave các player đã tới lượt (`nextAutosaveAt <= now`); mỗi người lưu xong thì hẹn lại sau một chu kỳ. */
    autosaveDue(now = Date.now()): Promise<void> {
        const interval = this.autosaveIntervalMs();
        const due = [...this.runtimes.values()].filter((runtime) => runtime.nextAutosaveAt <= now);
        for (const runtime of due) runtime.nextAutosaveAt = now + interval;
        return this.autosave(due);
    }

    /** Autosave mọi player ngay (không theo lượt): chụp vị trí từ world, lưu các nhóm dirty. */
    autosaveOnce(): Promise<void> {
        return this.autosave([...this.runtimes.values()]);
    }

    private async autosave(runtimes: readonly PlayerRuntime[]): Promise<void> {
        await Promise.all(
            runtimes.map((runtime) =>
                this.exclusive(runtime.playerId, () => this.saveDirty(runtime)).catch((error) => {
                    console.error(`[PlayerRuntime] autosave failed for ${runtime.playerId}`, error);
                })
            )
        );
    }

    /** Quên mọi object mà không lưu (dùng trong test mô phỏng crash). */
    dropAllWithoutSaving() {
        this.stopAutosave();
        for (const timer of this.flushTimers.values()) clearTimeout(timer);
        this.flushTimers.clear();
        this.runtimes.clear();
    }

    private async load(playerId: string): Promise<PlayerRuntime> {
        const snapshot = await playerService.getPlayableSnapshotOrFail(playerId);
        const data = {} as Record<string, unknown>;
        for (const columns of Object.values(PLAYER_GROUP_COLUMNS)) {
            for (const column of columns) data[column] = structuredClone(snapshot[column]);
        }
        const runtime = new PlayerRuntime(
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
        this.resetBaseline(runtime, WATCHED_GROUPS);
        return runtime;
    }

    private async transactOnce<T>(
        runtime: PlayerRuntime,
        fn: (draft: PlayerSavedState, tx: Queryable, runtime: PlayerRuntime) => Promise<T>,
        groups: ReadonlySet<PlayerDataGroup>
    ): Promise<T> {
        const draft = runtime.draft();
        runtime.replay = [];
        runtime.transactGroups = groups;
        let flushed: PlayerDataGroup[] = [];
        try {
            const outcome = await withTransaction(async (tx) => {
                const result = await fn(draft, tx, runtime);
                const changed = [...groups].filter((group) =>
                    this.groupDiffers(runtime, draft, group)
                );
                this.capturePlace(runtime);
                this.detectWatched(runtime);
                // Nhóm khác đang dirty cũng được ghi trong cùng câu UPDATE (lấy từ object thật, nhóm của transact thì từ bản nháp).
                const others = [...runtime.dirty].filter((group) => !groups.has(group));
                const patch = this.patchOf(runtime.data, others);
                Object.assign(patch, this.patchOf(draft, changed));
                for (const group of others) runtime.dirty.delete(group);
                flushed = others;
                const revision = await this.write(runtime, patch, tx);
                return { result, changed, revision };
            });
            const replay = runtime.replay;
            for (const group of outcome.changed) {
                for (const column of PLAYER_GROUP_COLUMNS[group]) {
                    (runtime.data as Record<string, unknown>)[column] = draft[column];
                }
                runtime.dirty.delete(group);
            }
            runtime.revision = outcome.revision;
            // Phát lại thay đổi đồng bộ xảy ra trong lúc chờ DB (chúng đã áp lên dữ liệu cũ vừa bị thay).
            for (const { group, change } of replay) {
                change(runtime.data);
                runtime.markDirty(group);
            }
            this.resetBaseline(runtime, WATCHED_GROUPS);
            if (runtime.dirty.size === 0) runtime.critical = false;
            if (outcome.changed.includes(PlayerDataGroup.BAG)) runtime.refreshStats();
            for (const group of new Set([
                ...outcome.changed,
                ...replay.map((entry) => entry.group),
            ])) {
                this.emitGroup(runtime, group);
            }
            return outcome.result;
        } catch (error) {
            for (const group of flushed) runtime.dirty.add(group);
            if (error instanceof TransactAbort) return error.value as T;
            throw error;
        } finally {
            runtime.replay = undefined;
            runtime.transactGroups = undefined;
        }
    }

    private groupDiffers(runtime: PlayerRuntime, draft: PlayerSavedState, group: PlayerDataGroup) {
        return PLAYER_GROUP_COLUMNS[group].some(
            (column) => !sameValue(draft[column], runtime.data[column])
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
        runtime: PlayerRuntime,
        patch: Record<string, unknown>,
        tx: Queryable
    ): Promise<number> {
        if (Object.keys(patch).length === 0) return runtime.revision;
        const row = await PlayerStateRepo.updateIfUnchanged(
            runtime.playerId,
            runtime.revision,
            patch as Partial<PlayerState>,
            tx
        );
        if (!row)
            throw new PlayerRuntimeConflictError(`player_states changed for ${runtime.playerId}`);
        await PlayerIdentityRepo.updateById({
            id: runtime.playerId,
            data: { lastPlayedAt: DateTime.now().toJSDate() },
            dbOrTx: tx,
        });
        return row.revision;
    }

    /** Lưu các nhóm dirty (gọi trong `exclusive`). Xung đột revision → gộp theo nhóm rồi thử lại. */
    private async saveDirty(runtime: PlayerRuntime): Promise<void> {
        this.clearFlushTimer(runtime.playerId);
        this.capturePlace(runtime);
        this.detectWatched(runtime);
        for (let attempt = 1; runtime.dirty.size > 0; attempt++) {
            const groups = [...runtime.dirty];
            // Bỏ cờ trước khi ghi: thay đổi xảy ra trong lúc chờ DB sẽ đặt lại cờ và được lưu ở lần sau.
            const wasCritical = runtime.critical;
            for (const group of groups) runtime.dirty.delete(group);
            runtime.critical = false;
            try {
                const patch = this.patchOf(runtime.data, groups);
                runtime.revision = await withTransaction((tx) => this.write(runtime, patch, tx));
                this.resetBaseline(runtime, WATCHED_GROUPS);
                return;
            } catch (error) {
                for (const group of groups) runtime.dirty.add(group);
                runtime.critical ||= wasCritical;
                if (
                    !(error instanceof PlayerRuntimeConflictError) ||
                    attempt >= MAX_TRANSACT_ATTEMPTS
                ) {
                    throw error;
                }
                if (!(await this.reconcile(runtime))) {
                    // Nhân vật đã bị xoá khi đang online: bỏ dữ liệu chưa lưu thay vì thử lại mãi.
                    runtime.dirty.clear();
                    runtime.critical = false;
                    console.warn(
                        `[PlayerRuntime] ${runtime.playerId} no longer exists, unsaved data dropped`
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
    private async reconcile(runtime: PlayerRuntime): Promise<boolean> {
        const row = await PlayerStateRepo.findByPlayerId(runtime.playerId);
        if (!row) return false;
        for (const group of ALL_PLAYER_GROUPS) {
            for (const column of PLAYER_GROUP_COLUMNS[group]) {
                if (runtime.dirty.has(group)) {
                    if (!sameValue(row[column], runtime.data[column])) {
                        console.warn(
                            `[PlayerRuntime] ${runtime.playerId}: ${group}.${column} changed outside, runtime value wins`
                        );
                    }
                    continue;
                }
                (runtime.data as Record<string, unknown>)[column] = row[column];
            }
        }
        runtime.revision = row.revision;
        runtime.refreshStats();
        this.resetBaseline(runtime, WATCHED_GROUPS);
        return true;
    }

    private capturePlace(runtime: PlayerRuntime) {
        const captured = runtime.capturePlace?.();
        if (!captured) return;
        const changed = PLAYER_GROUP_COLUMNS[PlayerDataGroup.PLACE].some(
            (column) => !sameValue(runtime.data[column], captured[column as keyof typeof captured])
        );
        if (!changed) return;
        Object.assign(runtime.data, captured);
        runtime.markDirty(PlayerDataGroup.PLACE);
    }

    private groupJson(runtime: PlayerRuntime, group: PlayerDataGroup) {
        return JSON.stringify(PLAYER_GROUP_COLUMNS[group].map((column) => runtime.data[column]));
    }

    private resetBaseline(runtime: PlayerRuntime, groups: readonly PlayerDataGroup[]) {
        for (const group of groups) {
            if (!runtime.dirty.has(group))
                runtime.baseline.set(group, this.groupJson(runtime, group));
        }
    }

    /** Nhóm world sửa tại chỗ: khác lần lưu trước thì coi là dirty. */
    private detectWatched(runtime: PlayerRuntime) {
        for (const group of WATCHED_GROUPS) {
            if (runtime.baseline.get(group) !== this.groupJson(runtime, group)) {
                runtime.markDirty(group);
            }
        }
    }

    /** Sau một thay đổi đồng bộ: đánh dấu dirty, phát sự kiện, đặt lịch lưu sớm nếu quan trọng. */
    private afterChange(
        runtime: PlayerRuntime,
        group: PlayerDataGroup,
        critical: boolean,
        stats = false
    ) {
        runtime.markDirty(group, critical);
        if (stats) runtime.refreshStats();
        this.emitGroup(runtime, group);
        if (critical) this.scheduleFlush(runtime);
    }

    private emitGroup(runtime: PlayerRuntime, group: PlayerDataGroup) {
        const event = GROUP_EVENT[group];
        if (event) this.emit(event, runtime);
    }

    private scheduleFlush(runtime: PlayerRuntime) {
        if (this.flushTimers.has(runtime.playerId)) return;
        const timer = setTimeout(() => {
            this.flushTimers.delete(runtime.playerId);
            this.flush(runtime.playerId).catch((error) => {
                console.error(`[PlayerRuntime] save failed for ${runtime.playerId}`, error);
            });
        }, CRITICAL_FLUSH_MS);
        timer.unref();
        this.flushTimers.set(runtime.playerId, timer);
    }

    private clearFlushTimer(playerId: string) {
        const timer = this.flushTimers.get(playerId);
        if (!timer) return;
        clearTimeout(timer);
        this.flushTimers.delete(playerId);
    }

    private release(runtime: PlayerRuntime) {
        this.clearFlushTimer(runtime.playerId);
        this.runtimes.delete(runtime.playerId);
        if (this.runtimes.size === 0) this.stopAutosave();
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
}
