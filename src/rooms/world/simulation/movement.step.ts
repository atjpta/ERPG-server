import { Direction } from "@/modules/auth/enums/player.enum.js";

/**
 * Hàm step di chuyển — **hợp đồng dùng chung với client** (Colyseus Netcode `predict.reconciler`).
 * Client Unity phải port y hệt sang C# (cùng thứ tự phép tính, cùng hằng số) để dự đoán khớp server;
 * lệch dù nhỏ sẽ gây giật khi reconcile. Chỉ dùng `dt` cố định từ `StepContext`, không đọc
 * thời gian thực, không random.
 */
export interface MovableState {
    x: number;
    y: number;
    direction: string;
    moving: boolean;
}

export interface MoveCommand {
    moveX: number;
    moveY: number;
}

export interface MoveBounds {
    width: number;
    height: number;
}

/** Hệ số chuẩn hoá khi đi chéo (1/√2) — hằng số để C# port khớp tuyệt đối. */
export const DIAGONAL_FACTOR = 0.7071067811865476;

export function applyMove(
    state: MovableState,
    cmd: MoveCommand,
    bounds: MoveBounds,
    speed: number,
    dt: number
): void {
    const { moveX, moveY } = cmd;
    state.moving = moveX !== 0 || moveY !== 0;
    if (!state.moving) return;

    // Đi chéo không nhanh hơn đi thẳng.
    const factor = moveX !== 0 && moveY !== 0 ? DIAGONAL_FACTOR : 1;
    const step = speed * dt * factor;
    state.x = clamp(state.x + moveX * step, 0, bounds.width);
    state.y = clamp(state.y + moveY * step, 0, bounds.height);
    state.direction = toDirection(moveX, moveY);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Ưu tiên hướng ngang khi đi chéo (sprite 4 hướng). Chỉ gọi khi đang di chuyển. */
function toDirection(moveX: number, moveY: number): Direction {
    if (moveX < 0) return Direction.LEFT;
    if (moveX > 0) return Direction.RIGHT;
    return moveY < 0 ? Direction.UP : Direction.DOWN;
}
