import type { Queryable } from "@/configs/postgres.config.js";
import type {
    PlayerDataGroup,
    PlayerStateEvent,
} from "@/modules/player/enums/player-state.enum.js";
import type { PlayerState } from "@/modules/player/state/player.state.js";
import type { PlayerSavedState } from "@/modules/player/types/player-fields.type.js";
import type { Response } from "@/core/response/response.js";
import type { PlayerChangeOp } from "@/modules/player/types/player-change.type.js";
import type { CurrencyReward } from "@/modules/rewards/types/reward.type.js";

export interface TransactOptions {
    /** Các nhóm `fn` được sửa (mặc định ví + túi). */
    groups?: readonly PlayerDataGroup[];
}

/** Bên giữ và lưu `PlayerState` (service của room runtime); module chỉ cần các thao tác này. */
export interface PlayerStateOwner {
    emit(event: PlayerStateEvent, playerState: PlayerState, detail?: unknown): void;
    mutate<T>(
        playerState: PlayerState,
        group: PlayerDataGroup,
        change: (data: PlayerSavedState) => T,
        options?: { critical?: boolean; stats?: boolean }
    ): T;
    credit(playerState: PlayerState, currency: readonly CurrencyReward[]): void;
    debit(playerState: PlayerState, costs: readonly CurrencyReward[]): boolean;
    saveProgressSoon(playerState: PlayerState): void;
    /** Áp dụng nguyên tử một lô thao tác túi / điểm; thất bại (không đổi gì) nếu không áp được. */
    applyOps(playerState: PlayerState, ops: readonly PlayerChangeOp[]): Response;
    transact<T>(
        playerId: string,
        fn: (draft: PlayerSavedState, tx: Queryable, playerState: PlayerState) => Promise<T>,
        options?: TransactOptions
    ): Promise<T>;
}
