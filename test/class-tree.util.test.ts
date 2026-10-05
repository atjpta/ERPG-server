import assert from "node:assert/strict";
import {
    buildUsableItemClassCodes,
    validateClassTree,
    type ClassTreeNode,
} from "@/modules/classes/utils/class-tree.util.js";

/**
 *   swordman (t1) ─┬─> knight (t2) ─┬─> paladin (t3)
 *                  │                └─> guardian_lord (t3)
 *   guardian (t1) ─┴─> knight        (knight có 2 class cha)
 *   mage (t1)
 */
const TREE: ClassTreeNode[] = [
    { code: "swordman", tier: 1, nextClassCodes: ["knight"] },
    { code: "guardian", tier: 1, nextClassCodes: ["knight"] },
    { code: "mage", tier: 1, nextClassCodes: [] },
    { code: "knight", tier: 2, nextClassCodes: ["paladin", "guardian_lord"] },
    { code: "paladin", tier: 3, nextClassCodes: [] },
    { code: "guardian_lord", tier: 3, nextClassCodes: [] },
];

const usable = buildUsableItemClassCodes(TREE);
const codes = (code: string) => [...(usable.get(code) ?? [])].sort();

describe("class-tree.util", () => {
    it("tier 2 mặc đồ của mọi class cha tier 1 + chính nó, không mặc đồ tier 3", () => {
        assert.deepEqual(codes("knight"), ["guardian", "knight", "swordman"]);
    });

    it("tier 3 mặc đồ của cả cây phía dưới, không mặc đồ nhánh tier 3 khác", () => {
        assert.deepEqual(codes("paladin"), ["guardian", "knight", "paladin", "swordman"]);
        assert.ok(!usable.get("paladin")?.has("guardian_lord"));
    });

    it("tier 1 chỉ mặc đồ của chính nó", () => {
        assert.deepEqual(codes("swordman"), ["swordman"]);
        assert.deepEqual(codes("mage"), ["mage"]);
    });

    it("cây hợp lệ không có lỗi", () => {
        assert.deepEqual(validateClassTree(TREE), []);
    });

    it("báo lỗi class con không tồn tại hoặc sai tier", () => {
        const errors = validateClassTree([
            { code: "swordman", tier: 1, nextClassCodes: ["knight", "ghost"] },
            { code: "knight", tier: 3, nextClassCodes: [] },
        ]);
        assert.equal(errors.length, 2);
        assert.ok(errors.some((error) => error.includes("ghost")));
        assert.ok(errors.some((error) => error.includes("tier")));
    });
});
