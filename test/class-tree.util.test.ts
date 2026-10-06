import assert from "node:assert/strict";
import {
    buildUsableItemClassCodes,
    validateClassTree,
    type ClassTreeNode,
} from "@/modules/classes/utils/class-tree.util.js";

/**
 *   swordsman (t1) ─┬─> knight (t2) ─┬─> paladin (t3)
 *                   │                └─> royal_knight (t3)
 *   cleric (t1) ────┴─> knight        (knight có 2 class cha)
 *   archer (t1)
 */
const TREE: ClassTreeNode[] = [
    { code: "swordsman", tier: 1, nextClassCodes: ["knight"] },
    { code: "cleric", tier: 1, nextClassCodes: ["knight"] },
    { code: "archer", tier: 1, nextClassCodes: [] },
    { code: "knight", tier: 2, nextClassCodes: ["paladin", "royal_knight"] },
    { code: "paladin", tier: 3, nextClassCodes: [] },
    { code: "royal_knight", tier: 3, nextClassCodes: [] },
];

const usable = buildUsableItemClassCodes(TREE);
const codes = (code: string) => [...(usable.get(code) ?? [])].sort();

describe("class-tree.util", () => {
    it("tier 2 mặc đồ của mọi class cha tier 1 + chính nó, không mặc đồ tier 3", () => {
        assert.deepEqual(codes("knight"), ["cleric", "knight", "swordsman"]);
    });

    it("tier 3 mặc đồ của cả cây phía dưới, không mặc đồ nhánh tier 3 khác", () => {
        assert.deepEqual(codes("paladin"), ["cleric", "knight", "paladin", "swordsman"]);
        assert.ok(!usable.get("paladin")?.has("royal_knight"));
    });

    it("tier 1 chỉ mặc đồ của chính nó", () => {
        assert.deepEqual(codes("swordsman"), ["swordsman"]);
        assert.deepEqual(codes("archer"), ["archer"]);
    });

    it("cây hợp lệ không có lỗi", () => {
        assert.deepEqual(validateClassTree(TREE), []);
    });

    it("báo lỗi class con không tồn tại hoặc sai tier", () => {
        const errors = validateClassTree([
            { code: "swordsman", tier: 1, nextClassCodes: ["knight", "ghost"] },
            { code: "knight", tier: 3, nextClassCodes: [] },
        ]);
        assert.equal(errors.length, 2);
        assert.ok(errors.some((error) => error.includes("ghost")));
        assert.ok(errors.some((error) => error.includes("tier")));
    });
});
