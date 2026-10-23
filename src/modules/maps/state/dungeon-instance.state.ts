import { MonsterStatus } from "@/modules/monsters/enums/monster-status.enum.js";
import type { MonsterWorldState } from "@/modules/monsters/state/monster.state.js";
import { dungeonService } from "@/modules/maps/services/dungeon.service.js";
import type {
    DungeonChamber,
    DungeonConfig,
    DungeonPhase,
    DungeonRect,
} from "@/modules/maps/types/game-map.type.js";
import type { MoveBounds } from "@/modules/player/simulation/movement.step.js";

/** Chờ thành viên party vào đủ trước khi bắt đầu chamber đầu tiên. */
export const DUNGEON_JOIN_GRACE_MS = 15_000;
/** Có người đã qua cổng vào chamber kế mà người khác chưa qua thì chờ chừng này ms, rồi đóng cổng và đưa người chưa qua sang chỗ vào. */
export const DUNGEON_CROSS_GRACE_MS = 10_000;

const isDead = (monster: MonsterWorldState) =>
    monster.hp <= 0 || monster.status === MonsterStatus.DEAD;

/**
 * Tiến độ 1 instance dungeon (server-only; phần HUD cần thấy nằm ở `DungeonWorldState`): ai đã vào, chamber / phase đang chạy,
 * quái đã spawn, cổng, đã clear chưa. Chỉ đổi dữ liệu và trả kết quả; spawn quái, gửi message, thưởng là việc của service.
 * `TTally` là kiểu bảng thưởng từng người (do room định nghĩa, state chỉ giữ).
 */
export class DungeonInstanceState<TTally = unknown> {
    started = false;
    startedAt = 0;
    readonly joined = new Set<string>();
    /** `elapsedTime` lúc người đầu tiên vào; chờ đủ người tối đa `DUNGEON_JOIN_GRACE_MS`. */
    firstJoinAt: number | null = null;
    chamberIndex = 0;
    chamberStartedAt = 0;
    /** Số phase của chamber hiện tại đã spawn. */
    spawnedPhases = 0;
    spawningPhase = false;
    /** Monster đã spawn của chamber hiện tại. */
    monsters: MonsterWorldState[] = [];
    /** Level quái của chamber hiện tại. */
    monsterLevel = 1;
    chamberCleared = false;
    /** `elapsedTime` lúc người đầu tiên qua cổng vào chamber kế (chờ những người còn lại tới `DUNGEON_CROSS_GRACE_MS`). */
    crossedAt: number | null = null;
    cleared = false;
    /** Những gì từng người nhận được trong lần đi này (key = playerId) — hiện ở bảng thưởng sau khi clear. */
    readonly rewards = new Map<string, TTally>();
    /** Map + cổng chắn của chamber đang chơi (đổi khi vào / dọn xong chamber); chưa có thì dùng địa hình map. */
    bounds?: MoveBounds;

    constructor(
        readonly config: DungeonConfig,
        readonly instanceId: string,
        /** Người được party kỳ vọng vào instance (rỗng = bắt đầu ngay khi người đầu tiên vào). */
        readonly expected: string[] = [],
        /** Chủ party lúc vào (nguồn: kỳ vọng do global room ghi) — người duy nhất được bấm "đi lại". Rỗng nếu không rõ. */
        readonly leaderPlayerId = ""
    ) {}

    get chamber(): DungeonChamber {
        return this.config.chambers[this.chamberIndex];
    }

    /** Chamber kế (không có = đang ở chamber cuối). */
    get nextChamber(): DungeonChamber | undefined {
        return this.config.chambers[this.chamberIndex + 1];
    }

    // ---- vào dungeon --------------------------------------------------------------------------------------------------------------

    /** Ghi nhận người vào; tạo bảng thưởng cho người đó nếu chưa có. */
    registerJoin(playerId: string, now: number, newTally: () => TTally): void {
        this.joined.add(playerId);
        if (!this.rewards.has(playerId)) this.rewards.set(playerId, newTally());
        this.firstJoinAt ??= now;
    }

    /** Chưa bắt đầu mà mọi người party kỳ vọng đã vào đủ. */
    get readyToStart(): boolean {
        return !this.started && this.expected.every((id) => this.joined.has(id));
    }

    /** Hết thời gian chờ đủ người (tính từ người đầu tiên vào). */
    joinGraceExpired(now: number): boolean {
        return this.firstJoinAt !== null && now - this.firstJoinAt >= DUNGEON_JOIN_GRACE_MS;
    }

    begin(now: number): void {
        this.started = true;
        this.startedAt = now;
    }

    // ---- thời gian ----------------------------------------------------------------------------------------------------------------

    /** Giây còn lại của dungeon; `undefined` nếu dungeon không giới hạn thời gian. */
    timeLeftSec(now: number): number | undefined {
        const limit = this.config.timeLimitSec;
        if (!limit) return undefined;
        return Math.max(0, limit - Math.floor((now - this.startedAt) / 1000));
    }

    elapsedSec(now: number): number {
        return Math.floor((now - this.startedAt) / 1000);
    }

    // ---- chamber / phase ----------------------------------------------------------------------------------------------------------

    /** Bắt đầu chamber `index`: đặt lại tiến độ chamber. Trả quái của chamber trước để người gọi dọn khỏi state. */
    beginChamber(index: number, now: number, monsterLevel: number): MonsterWorldState[] {
        const previous = this.monsters;
        this.chamberIndex = index;
        this.chamberStartedAt = now;
        this.spawnedPhases = 0;
        this.spawningPhase = false;
        this.monsters = [];
        this.chamberCleared = false;
        this.crossedAt = null;
        this.monsterLevel = monsterLevel;
        return previous;
    }

    chamberElapsedSec(now: number): number {
        return (now - this.chamberStartedAt) / 1000;
    }

    /** Phase kế của chamber hiện tại (đã spawn hết thì `undefined`). */
    get upcomingPhase(): DungeonPhase | undefined {
        return this.chamber.phases[this.spawnedPhases];
    }

    /** Tới giờ spawn phase kế (và chưa đang spawn phase nào). */
    isPhaseDue(now: number): boolean {
        const phase = this.upcomingPhase;
        return !!phase && !this.spawningPhase && this.chamberElapsedSec(now) >= phase.delaySec;
    }

    /** Giây tới phase kế (tối thiểu 1); 0 nếu không còn phase. */
    nextPhaseInSec(now: number): number {
        const phase = this.upcomingPhase;
        return phase ? Math.max(1, Math.ceil(phase.delaySec - this.chamberElapsedSec(now))) : 0;
    }

    /** Quái còn sống / chưa spawn / tổng của chamber hiện tại. */
    monsterCounts(): { alive: number; pending: number; total: number } {
        const phases = this.chamber.phases;
        return {
            alive: this.monsters.filter((monster) => !isDead(monster)).length,
            pending: dungeonService.phasesMonsterCount(phases.slice(this.spawnedPhases)),
            total: dungeonService.phasesMonsterCount(phases),
        };
    }

    /** Chamber đã spawn hết phase và hạ hết quái (chưa đánh dấu dọn xong). */
    isChamberDone(alive: number): boolean {
        return (
            !this.chamberCleared &&
            this.spawnedPhases === this.chamber.phases.length &&
            !this.spawningPhase &&
            alive === 0
        );
    }

    markChamberCleared(): void {
        this.chamberCleared = true;
    }

    markCleared(): void {
        this.cleared = true;
    }

    // ---- sang chamber kế ----------------------------------------------------------------------------------------------------------

    /** Điểm `point` đã vào trong `chamber` và qua hẳn cổng vào (không thì cổng đóng lên người). */
    hasPassedEntry(chamber: DungeonChamber, point: { x: number; y: number }): boolean {
        const { bounds, entryGate } = chamber;
        const edge = entryGate ? entryGate.x + entryGate.w : bounds.x;
        return (
            point.x >= edge &&
            point.x < bounds.x + bounds.w &&
            point.y >= bounds.y &&
            point.y < bounds.y + bounds.h
        );
    }

    /**
     * Cập nhật việc qua cổng: `crossed` người đã qua trong tổng `total` người còn sống. Trả `true` khi chamber kế nên bắt đầu
     * (mọi người đã qua, hoặc hết `DUNGEON_CROSS_GRACE_MS` kể từ người đầu tiên qua).
     */
    trackCrossing(now: number, crossed: number, total: number): boolean {
        if (crossed === 0) {
            this.crossedAt = null;
            return false;
        }
        this.crossedAt ??= now;
        return crossed === total || now - this.crossedAt >= DUNGEON_CROSS_GRACE_MS;
    }

    // ---- cổng chắn ----------------------------------------------------------------------------------------------------------------

    /**
     * Tính lại vùng chặn cho chamber hiện tại (cổng chặn đường tới khi dọn xong; đã dọn thì không có cổng) và trả danh sách cổng
     * để người gọi cập nhật state đồng bộ.
     */
    refreshBounds(
        map: Pick<MoveBounds, "width" | "height"> & { colliders: readonly DungeonRect[] }
    ) {
        const chamber = this.chamber;
        const gates = this.chamberCleared
            ? []
            : [chamber.entryGate, chamber.exitGate].filter((gate) => gate !== undefined);
        this.bounds = {
            width: map.width,
            height: map.height,
            colliders: [...map.colliders, ...gates],
        };
        return gates;
    }
}
