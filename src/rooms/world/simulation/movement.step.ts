import { Direction } from "@/modules/player/enums/player.enum.js";

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

export interface WorldMovableState extends MovableState {
    moveSpeed: number;
}

export interface MoveCommand {
    moveX: number;
    moveY: number;
    attack?: boolean;
    dash?: boolean;
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
    const moveX = Number.isFinite(cmd.moveX) ? cmd.moveX : 0;
    const moveY = Number.isFinite(cmd.moveY) ? cmd.moveY : 0;
    if (!Number.isFinite(state.x)) state.x = bounds.width / 2;
    if (!Number.isFinite(state.y)) state.y = bounds.height / 2;
    if (!Number.isFinite(speed) || !Number.isFinite(dt)) {
        state.moving = false;
        return;
    }
    state.moving = moveX !== 0 || moveY !== 0;
    if (!state.moving) return;

    // Đi chéo không nhanh hơn đi thẳng.
    const factor = moveX !== 0 && moveY !== 0 ? DIAGONAL_FACTOR : 1;
    const step = speed * dt * factor;
    state.x = clamp(state.x + moveX * step, 0, bounds.width);
    state.y = clamp(state.y + moveY * step, 0, bounds.height);
    if (moveX < 0) state.direction = Direction.LEFT;
    else if (moveX > 0) state.direction = Direction.RIGHT;
}

/** Chuẩn hóa tốc độ và fixed-step trước khi di chuyển mọi entity trong world. */
export function applyWorldMove(
    state: WorldMovableState,
    cmd: MoveCommand,
    bounds: MoveBounds,
    dt: number,
    speedMultiplier = 1,
    fallbackSpeed = 0
): void {
    const stepSeconds = Number.isFinite(dt) && dt > 0 ? dt : 1 / 20;
    const moveSpeed =
        Number.isFinite(state.moveSpeed) && state.moveSpeed > 0 ? state.moveSpeed : fallbackSpeed;
    applyMove(state, cmd, bounds, moveSpeed * speedMultiplier, stepSeconds);
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Chỉ cập nhật hướng nhìn theo trục ngang; trục Y vẫn điều khiển di chuyển độc lập. */
