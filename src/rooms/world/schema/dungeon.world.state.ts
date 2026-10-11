import { Schema, type } from "@colyseus/schema";

/** Tiến độ dungeon cho HUD (room `dungeon`): chamber, phase, bộ đếm quái, đếm ngược. */
export class DungeonWorldState extends Schema {
    @type("uint8") chamberIndex = 0;
    @type("uint8") chamberCount = 0;
    /** Phase đã spawn của chamber hiện tại (đếm từ 1; 0 = chamber chưa bắt đầu). */
    @type("uint8") phaseIndex = 0;
    @type("uint8") phaseCount = 0;
    /** Quái còn phải hạ (còn sống + chưa spawn) để qua chamber kế. */
    @type("uint16") remaining = 0;
    /** Tổng quái của chamber (kể cả phase chưa spawn). */
    @type("uint16") total = 0;
    /** Giây tới phase kế spawn; 0 = không còn phase nào chờ. */
    @type("uint16") nextPhaseInSec = 0;
    /** Chamber hiện tại đã dọn xong, cổng exit mở. */
    @type("boolean") exitOpen = false;
    /** Đã hạ boss. */
    @type("boolean") cleared = false;
    /** Giây còn lại của dungeon (0 = không giới hạn). */
    @type("uint16") timeLeftSec = 0;
    /** Level quái của chamber hiện tại. */
    @type("uint16") monsterLevel = 0;
}
