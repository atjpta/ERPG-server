import assert from "node:assert/strict";
import { compareVersion } from "@/core/utils/version.util.js";

describe("version.util — compareVersion", () => {
    it("so sánh theo số, không theo chuỗi", () => {
        assert.equal(compareVersion("1.10.0", "1.9.0"), 1);
        assert.equal(compareVersion("1.2.3", "1.2.3"), 0);
        assert.equal(compareVersion("0.9.9", "1.0.0"), -1);
    });

    it("thiếu phần coi như 0", () => {
        assert.equal(compareVersion("1.2", "1.2.0"), 0);
        assert.equal(compareVersion("2", "1.99.99"), 1);
    });
});
