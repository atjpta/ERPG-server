import { applyWorldMove } from "@/modules/player/simulation/movement.step.js";
import { checkEqual, test } from "./harness.js";

/**
 * Va chạm địa hình của bước di chuyển. Các số kỳ vọng là hợp đồng với client: `WorldCollisionTests.cs`
 * (Assets/Src/Tests/Editor) chạy đúng các ca này và phải ra đúng các số này. Đổi thuật toán thì đổi cả hai.
 */
const colliders = [
    { x: 2, y: -5, w: 2, h: 10 },
    { x: -10, y: 3, w: 20, h: 1 },
    { x: 6, y: 0, w: 1, h: 1 },
];
const bounds = { width: 40, height: 20, colliders };
const collider = { width: 0.8, height: 0.4, offsetX: 0, offsetY: -0.3 };

const cases: {
    name: string;
    from: [number, number];
    move: [number, number];
    steps: number;
    to: [number, number];
}[] = [
    { name: "đi thẳng vào tường", from: [0, 0], move: [1, 0], steps: 40, to: [1.6, 0] },
    {
        name: "đi chéo trượt dọc tường tới trần",
        from: [0, 0],
        move: [1, 1],
        steps: 60,
        to: [1.6, 3.0999999999999996],
    },
    {
        name: "lấn ít vào góc khối thì trượt qua",
        from: [5, 0.9],
        move: [1, 0],
        steps: 30,
        to: [7.399999999999993, 1.5],
    },
    {
        name: "đứng sẵn trong khối vẫn đi ra được",
        from: [2.5, 0],
        move: [1, 0],
        steps: 10,
        to: [3.500000000000001, 0],
    },
    {
        name: "đi thẳng vào tường từ bên phải",
        from: [8, 0],
        move: [-1, 0],
        steps: 60,
        to: [4.4, 0],
    },
    {
        name: "đi lên chạm trần",
        from: [0, 0],
        move: [0, 1],
        steps: 80,
        to: [0, 3.0999999999999996],
    },
    {
        name: "đi lên lấn ít vào góc khối thì trượt",
        from: [6.3, -1.2],
        move: [0, 1],
        steps: 30,
        to: [5.6, 0.9999999999999999],
    },
    {
        name: "đi tự do không có gì chặn",
        from: [-8, -8],
        move: [1, -1],
        steps: 20,
        to: [-6.585786437626908, -9.414213562373092],
    },
];

for (const c of cases) {
    test(`movement: ${c.name}`, async () => {
        const state = {
            x: c.from[0],
            y: c.from[1],
            direction: "right",
            moving: false,
            moveSpeed: 4,
            collider,
        };
        for (let i = 0; i < c.steps; i++) {
            applyWorldMove(state, { moveX: c.move[0], moveY: c.move[1] }, bounds, 0.025);
        }
        checkEqual([state.x, state.y], c.to, c.name);
    });
}
