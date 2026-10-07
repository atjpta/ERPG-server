import assert from "node:assert/strict";
import { Direction } from "@/modules/player/enums/player.enum.js";
import {
    applyMove,
    DIAGONAL_FACTOR,
    type MovableState,
} from "@/rooms/world/simulation/movement.step.js";

/**
 * `applyMove` là hợp đồng với client Unity (prediction) — test này khoá hành vi.
 * Đổi kết quả ở đây = phải đổi bản C# tương ứng.
 */
const bounds = { width: 64, height: 64 };
const SPEED = 4;
const DT = 1 / 20;

const createState = (x = 10, y = 10): MovableState => ({
    x,
    y,
    direction: Direction.DOWN,
    moving: false,
});

describe("movement.step — applyMove", () => {
    it("đứng yên khi input = 0, giữ nguyên hướng", () => {
        const state = createState();
        state.direction = Direction.LEFT;
        applyMove(state, { moveX: 0, moveY: 0 }, bounds, SPEED, DT);
        assert.deepEqual(state, { x: 10, y: 10, direction: Direction.LEFT, moving: false });
    });

    it("đi thẳng đúng speed * dt mỗi step", () => {
        const state = createState();
        applyMove(state, { moveX: 1, moveY: 0 }, bounds, SPEED, DT);
        assert.equal(state.x, 10 + SPEED * DT);
        assert.equal(state.y, 10);
        assert.equal(state.direction, Direction.RIGHT);
        assert.equal(state.moving, true);
    });

    it("đi chéo không nhanh hơn đi thẳng", () => {
        const state = createState();
        applyMove(state, { moveX: 1, moveY: 1 }, bounds, SPEED, DT);
        const step = SPEED * DT * DIAGONAL_FACTOR;
        assert.equal(state.x, 10 + step);
        assert.equal(state.y, 10 + step);
        assert.ok(Math.hypot(state.x - 10, state.y - 10) <= SPEED * DT + 1e-9);
    });

    it("ưu tiên hướng ngang khi đi chéo (sprite 4 hướng)", () => {
        const state = createState();
        applyMove(state, { moveX: -1, moveY: -1 }, bounds, SPEED, DT);
        assert.equal(state.direction, Direction.LEFT);
        applyMove(state, { moveX: 0, moveY: -1 }, bounds, SPEED, DT);
        assert.equal(state.direction, Direction.UP);
    });

    it("không đi ra ngoài biên map", () => {
        const state = createState(0.05, 63.99);
        applyMove(state, { moveX: -1, moveY: 1 }, bounds, SPEED, DT);
        assert.equal(state.x, 0);
        assert.equal(state.y, 64);
    });

    it("20 step liên tiếp = 1 giây di chuyển (deterministic)", () => {
        const state = createState(32, 32);
        for (let i = 0; i < 20; i++) applyMove(state, { moveX: 1, moveY: 0 }, bounds, SPEED, DT);
        assert.equal(state.x.toFixed(6), (32 + SPEED).toFixed(6));
    });
});

describe("movement.step — va chạm địa hình", () => {
    const footprint = { width: 1, height: 1 };
    const wall = { x: 12, y: 0, w: 2, h: 64 };
    const terrain = { ...bounds, colliders: [wall] };

    it("dừng sát tường khi đi ngang", () => {
        const state = createState(11.4, 10);
        applyMove(state, { moveX: 1, moveY: 0 }, terrain, SPEED, DT, footprint);
        assert.equal(state.x, 11.5);
        assert.equal(state.y, 10);
    });

    it("trượt dọc tường khi đi chéo", () => {
        const state = createState(11.5, 10);
        applyMove(state, { moveX: 1, moveY: 1 }, terrain, SPEED, DT, footprint);
        assert.equal(state.x, 11.5);
        assert.ok(state.y > 10);
    });

    it("tường chặn cả khi đi ngược chiều", () => {
        const state = createState(14.6, 10);
        applyMove(state, { moveX: -1, moveY: 0 }, terrain, SPEED, DT, footprint);
        assert.equal(state.x, 14.5);
    });

    it("không có footprint thì bỏ qua collider", () => {
        const state = createState(11.9, 10);
        applyMove(state, { moveX: 1, moveY: 0 }, terrain, SPEED, DT);
        assert.ok(state.x > 11.9);
    });

    it("đang nằm trong tường vẫn đi ra được", () => {
        const state = createState(13, 10);
        applyMove(state, { moveX: 1, moveY: 0 }, terrain, SPEED, DT, footprint);
        assert.equal(state.x, 13 + SPEED * DT);
    });
});
