import assert from "node:assert/strict";
import { loadMapFiles } from "@/modules/maps/seeds/game-map.seed.js";
import { hashMapFile, mapFileToRow, parseMapFile } from "@/modules/maps/utils/map-file.util.js";

const base = () => ({
    code: "t",
    type: "town",
    width: 10,
    height: 10,
    spawnPoints: [{ id: "default", x: 1, y: 1, kind: "default" }],
});

describe("map file", () => {
    it("mọi file data trong repo đều hợp lệ", () => {
        assert.ok(loadMapFiles().length >= 2);
    });

    it("bắt buộc đúng 1 spawn default", () => {
        assert.throws(() =>
            parseMapFile({ ...base(), spawnPoints: [{ id: "a", x: 1, y: 1, kind: "respawn" }] })
        );
    });

    it("từ chối collider ra ngoài map và id trùng", () => {
        assert.throws(() => parseMapFile({ ...base(), colliders: [{ x: 9, y: 0, w: 5, h: 1 }] }));
        const dup = [...base().spawnPoints, { id: "default", x: 2, y: 2, kind: "respawn" }];
        assert.throws(() => parseMapFile({ ...base(), spawnPoints: dup }));
    });

    it("hash không phụ thuộc thứ tự khoá, đổi nội dung thì đổi hash", () => {
        const a = parseMapFile(base());
        const b = parseMapFile(Object.fromEntries(Object.entries(base()).reverse()));
        assert.equal(hashMapFile(a), hashMapFile(b));
        const moved = parseMapFile({
            ...base(),
            spawnPoints: [{ id: "default", x: 2, y: 1, kind: "default" }],
        });
        assert.notEqual(hashMapFile(a), hashMapFile(moved));
    });

    it("spawnX/Y của row lấy từ spawn default", () => {
        const row = mapFileToRow(parseMapFile(base()));
        assert.equal(row.spawnX, 1);
        assert.equal(row.contentHash.length, 40);
    });

    it("monsterLevel của map được điền vào từng spawn, spawn có khoảng riêng thì giữ", () => {
        const spawn = { monsterCode: "slime", count: 1, spawnX: 1, spawnY: 1 };
        const map = parseMapFile({
            ...base(),
            monsterLevel: { min: 2, max: 4 },
            monsterSpawns: [
                { ...spawn, type: "random" },
                { ...spawn, minLevel: 6, maxLevel: 7 },
            ],
        });
        const [a, b] = mapFileToRow(map).monsterSpawns;
        assert.deepEqual([a.type, a.minLevel, a.maxLevel], ["random", 2, 4]);
        assert.deepEqual([b.minLevel, b.maxLevel], [6, 7]);
    });

    it("từ chối khoảng level ngược và type không hợp lệ", () => {
        const spawn = { monsterCode: "slime", count: 1, spawnX: 1, spawnY: 1 };
        assert.throws(() => parseMapFile({ ...base(), monsterLevel: { min: 5, max: 2 } }));
        assert.throws(() =>
            parseMapFile({ ...base(), monsterSpawns: [{ ...spawn, type: "legend" }] })
        );
    });
});
