import assert from "node:assert/strict";
import {
    PLAYER_NAME_PATTERN,
    playerNameLength,
    randomPlayerName,
} from "@/modules/player/utils/player-name.util.js";

describe("player-name.util", () => {
    it("đếm độ dài theo ký tự, kể cả tiếng Việt có dấu", () => {
        assert.equal(playerNameLength("Đạt"), 3);
        assert.equal(playerNameLength("Nguyễn_99"), 9);
    });

    it("tên ngẫu nhiên luôn đúng độ dài và đúng ký tự cho phép", () => {
        for (let attempt = 0; attempt < 6; attempt++) {
            for (let i = 0; i < 200; i++) {
                const name = randomPlayerName({ minLength: 3, maxLength: 16, attempt });
                const length = playerNameLength(name);
                assert.ok(length >= 3 && length <= 16, `${name} (${length})`);
                assert.match(name, PLAYER_NAME_PATTERN);
            }
        }
    });

    it("giữ đúng giới hạn khi độ dài tối đa rất ngắn hoặc tối thiểu dài", () => {
        for (let i = 0; i < 200; i++) {
            assert.ok(
                playerNameLength(randomPlayerName({ minLength: 3, maxLength: 4, attempt: 3 })) <= 4
            );
            assert.ok(playerNameLength(randomPlayerName({ minLength: 10, maxLength: 12 })) >= 10);
        }
    });
});
