import assert from "node:assert/strict";
import { assertRateLimit } from "@/core/utils/rate-limit.util.js";

describe("rate-limit.util — assertRateLimit", () => {
    const rule = { name: `test-${Date.now()}`, limit: 3, windowSeconds: 60 };

    it("cho qua tới đúng `limit` lần, lần sau bị 429", async () => {
        for (let i = 0; i < rule.limit; i++) await assertRateLimit(rule, "a@b.cc");
        await assert.rejects(assertRateLimit(rule, "a@b.cc"), { statusCode: 429 });
    });

    it("đếm riêng theo danh tính, không phân biệt hoa thường", async () => {
        await assertRateLimit(rule, "other@b.cc");
        await assert.rejects(assertRateLimit(rule, "A@B.CC"), { statusCode: 429 });
    });
});
