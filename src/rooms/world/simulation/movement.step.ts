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

/** Vùng chặn tĩnh (tile, gốc trên-trái, y xuống) — tường, nước, cây... lấy từ file map. */
export interface BlockRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Hình chân của entity khi va chạm địa hình — cùng quy ước `CollisionBounds`: tâm = (x + offsetX, y - offsetY),
 * offsetY dương hướng lên (như prefab client), rộng `width` cao `height`.
 */
export interface MoveFootprint {
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
}

export interface WorldMovableState extends MovableState {
    moveSpeed: number;
    collider?: MoveFootprint;
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
    /** Vùng không đi vào được; bỏ trống = chỉ chặn ở biên map. */
    colliders?: readonly BlockRect[];
}

/**
 * Sai số khi xét "đã nằm trong khối chặn từ trước": vị trí sau lần snap sát tường lệch vài 1e-6 do float32 của state
 * (client nhận x từ server dạng float32), không có ngưỡng này entity đứng sát tường bị coi là đang kẹt trong tường và đi xuyên.
 * Client C# (WorldCollision) phải dùng cùng giá trị.
 */
export const TERRAIN_EPSILON = 1e-4;

/**
 * Đi thẳng vào mép một khối chặn mà chỉ lấn nó chừng này (tile) thì được đẩy trượt sang bên cho vòng qua góc,
 * thay vì đứng khựng. Lấn nhiều hơn (đâm giữa tường, kẹt giữa hai khối) thì đứng yên như cũ.
 * Client C# (WorldCollision) phải dùng cùng giá trị.
 */
export const SLIDE_REACH = 1;

/** Hệ số chuẩn hoá khi đi chéo (1/√2) — hằng số để C# port khớp tuyệt đối. */
export const DIAGONAL_FACTOR = 0.7071067811865476;

export function applyMove(
    state: MovableState,
    cmd: MoveCommand,
    bounds: MoveBounds,
    speed: number,
    dt: number,
    footprint?: MoveFootprint
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
    const prevX = state.x;
    const prevY = state.y;

    // Đi chéo không nhanh hơn đi thẳng.
    const factor = moveX !== 0 && moveY !== 0 ? DIAGONAL_FACTOR : 1;
    const step = speed * dt * factor;
    // Tách trục (X rồi Y) để trượt dọc tường thay vì đứng khựng.
    state.x = clamp(state.x + moveX * step, 0, bounds.width);
    state.y = clamp(state.y + moveY * step, 0, bounds.height);
    if (footprint && bounds.colliders?.length) {
        const wantX = state.x;
        const wantY = state.y;
        resolveTerrain(state, prevX, prevY, bounds.colliders, footprint);
        slideAroundCorner(state, { wantX, wantY, moveX, moveY, step }, bounds, footprint);
    }
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
    applyMove(state, cmd, bounds, moveSpeed * speedMultiplier, stepSeconds, state.collider);
}

/**
 * Đẩy entity về sát cạnh vùng chặn theo từng trục. Rect mà entity đã nằm trong từ trước (spawn lỡ vào tường)
 * bị bỏ qua để entity còn đường thoát ra.
 */
function resolveTerrain(
    state: MovableState,
    prevX: number,
    prevY: number,
    colliders: readonly BlockRect[],
    footprint: MoveFootprint
): void {
    const halfW = footprint.width / 2;
    const halfH = footprint.height / 2;
    const offX = footprint.offsetX ?? 0;
    const offY = footprint.offsetY ?? 0;

    // Trục X: giữ y cũ.
    const cy = prevY - offY;
    let x = state.x;
    for (const r of colliders) {
        if (cy + halfH <= r.y || cy - halfH >= r.y + r.h) continue;
        const prevLeft = prevX + offX - halfW;
        const prevRight = prevX + offX + halfW;
        const left = x + offX - halfW;
        const right = x + offX + halfW;
        if (right <= r.x || left >= r.x + r.w) continue;
        if (x > prevX && prevRight <= r.x + TERRAIN_EPSILON) x = r.x - halfW - offX;
        else if (x < prevX && prevLeft >= r.x + r.w - TERRAIN_EPSILON) x = r.x + r.w + halfW - offX;
    }
    state.x = x;

    // Trục Y: dùng x đã xử lý.
    const cx = state.x + offX;
    let y = state.y;
    const prevCy = prevY - offY;
    for (const r of colliders) {
        if (cx + halfW <= r.x || cx - halfW >= r.x + r.w) continue;
        const top = y - offY - halfH;
        const bottom = y - offY + halfH;
        if (bottom <= r.y || top >= r.y + r.h) continue;
        if (y > prevY && prevCy + halfH <= r.y + TERRAIN_EPSILON) y = r.y - halfH + offY;
        else if (y < prevY && prevCy - halfH >= r.y + r.h - TERRAIN_EPSILON)
            y = r.y + r.h + halfH + offY;
    }
    state.y = y;
}

interface SlideInput {
    /** Vị trí muốn tới trước khi bị chặn. */
    wantX: number;
    wantY: number;
    moveX: number;
    moveY: number;
    /** Quãng đường tối đa của một bước. */
    step: number;
}

/**
 * Đi thẳng theo một trục mà bị mép một khối chặn lấn ít (≤ SLIDE_REACH) thì trượt sang trục kia cho tới khi
 * qua hết góc. Đi chéo đã tự trượt dọc tường (resolveTerrain tách trục). Không có chỗ trượt (vị trí mới lại
 * đâm vào khối khác, hoặc lấn quá nhiều) thì thôi: đứng yên.
 */
function slideAroundCorner(
    state: MovableState,
    input: SlideInput,
    bounds: MoveBounds,
    footprint: MoveFootprint
): void {
    const colliders = bounds.colliders;
    if (!colliders?.length) return;
    const { wantX, wantY, moveX, moveY, step } = input;
    const halfW = footprint.width / 2;
    const halfH = footprint.height / 2;
    const offX = footprint.offsetX ?? 0;
    const offY = footprint.offsetY ?? 0;

    if (moveY === 0 && moveX !== 0 && state.x !== wantX) {
        // Đẩy ngang bị chặn: các khối mà vị trí muốn tới đâm vào, tính phải dời lên / xuống bao nhiêu để qua hết.
        const cy = state.y - offY;
        const left = wantX + offX - halfW;
        const right = wantX + offX + halfW;
        let up = 0;
        let down = 0;
        for (const r of colliders) {
            if (right <= r.x || left >= r.x + r.w) continue;
            if (cy + halfH <= r.y || cy - halfH >= r.y + r.h) continue;
            up = Math.max(up, cy + halfH - r.y);
            down = Math.max(down, r.y + r.h - (cy - halfH));
        }
        const need = Math.min(up, down);
        if (need <= 0 || need > SLIDE_REACH) return;
        const nextY = clamp(
            state.y + (up <= down ? -1 : 1) * Math.min(need, step),
            0,
            bounds.height
        );
        if (!overlapsTerrain(state.x, nextY, colliders, footprint)) state.y = nextY;
    } else if (moveX === 0 && moveY !== 0 && state.y !== wantY) {
        const cy = wantY - offY;
        const top = cy - halfH;
        const bottom = cy + halfH;
        const cx = state.x + offX;
        let toLeft = 0;
        let toRight = 0;
        for (const r of colliders) {
            if (bottom <= r.y || top >= r.y + r.h) continue;
            if (cx + halfW <= r.x || cx - halfW >= r.x + r.w) continue;
            toLeft = Math.max(toLeft, cx + halfW - r.x);
            toRight = Math.max(toRight, r.x + r.w - (cx - halfW));
        }
        const need = Math.min(toLeft, toRight);
        if (need <= 0 || need > SLIDE_REACH) return;
        const nextX = clamp(
            state.x + (toLeft <= toRight ? -1 : 1) * Math.min(need, step),
            0,
            bounds.width
        );
        if (!overlapsTerrain(nextX, state.y, colliders, footprint)) state.x = nextX;
    }
}

/** Chân entity ở (x, y) có lấn vào khối chặn nào không (chạm mép thì không tính). */
function overlapsTerrain(
    x: number,
    y: number,
    colliders: readonly BlockRect[],
    footprint: MoveFootprint
): boolean {
    const halfW = footprint.width / 2;
    const halfH = footprint.height / 2;
    const cx = x + (footprint.offsetX ?? 0);
    const cy = y - (footprint.offsetY ?? 0);
    for (const r of colliders) {
        if (cx + halfW <= r.x + TERRAIN_EPSILON || cx - halfW >= r.x + r.w - TERRAIN_EPSILON)
            continue;
        if (cy + halfH <= r.y + TERRAIN_EPSILON || cy - halfH >= r.y + r.h - TERRAIN_EPSILON)
            continue;
        return true;
    }
    return false;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Chỉ cập nhật hướng nhìn theo trục ngang; trục Y vẫn điều khiển di chuyển độc lập. */
