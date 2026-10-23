import { Schema, type } from "@colyseus/schema";

import type { SkillAura } from "@/modules/skills/schemas/skill-config.schema.js";
import type { SkillOwner } from "@/modules/combat/types/skill-owner.type.js";

/**
 * Vùng buff của skill AURA (hit event `AURA`): bám theo người dùng, tồn tại `ticksLeft` tick rồi bị xoá khỏi
 * `WorldState.auras`. Client vẽ prefab tại chân nhân vật `playerId`, phóng theo `radiusX` so với bán kính gốc trong
 * `skills.json`. Toạ độ server: ô, gốc ở giữa map, y hướng lên. Mỗi `tickEvery` tick hồi đồng đội / gây damage quái trong vùng.
 */
export class AuraWorldState extends Schema {
    @type("string") id: string;
    /** playerId của người dùng skill — khoá của nhân vật bên client. */
    @type("string") playerId: string;
    @type("string") skillId: string;
    /** Số thứ tự skill chủ động của người dùng (`castSlot`) — để HUD biết nút nào đang có buff. */
    @type("uint8") slot: number;
    /** Nửa trục (ô) của vùng elip, đã tính theo level. */
    @type("float32") radiusX: number;
    @type("float32") radiusY: number;
    @type("uint16") ticksLeft: number;

    owner: SkillOwner;
    aura: SkillAura;
    eventIndex: number;
    /** Tick tới lượt gây hiệu ứng kế tiếp, và chu kỳ. */
    ticksToNext: number;
    tickEvery: number;
    /** Hồi chiêu (tick) của skill tính từ lúc buff hết — đặt lại cho người dùng khi vùng bị xoá. */
    cooldownTicks: number;
    attackSerial: number;

    constructor(props: {
        id: string;
        owner: SkillOwner;
        playerId: string;
        skillId: string;
        slot: number;
        aura: SkillAura;
        eventIndex: number;
        radiusX: number;
        radiusY: number;
        durationTicks: number;
        tickEvery: number;
        cooldownTicks: number;
        attackSerial: number;
    }) {
        super();
        this.id = props.id;
        this.owner = props.owner;
        this.playerId = props.playerId;
        this.skillId = props.skillId;
        this.slot = props.slot;
        this.aura = props.aura;
        this.eventIndex = props.eventIndex;
        this.radiusX = props.radiusX;
        this.radiusY = props.radiusY;
        this.ticksLeft = Math.min(props.durationTicks, 0xffff);
        this.tickEvery = props.tickEvery;
        this.ticksToNext = props.tickEvery;
        this.cooldownTicks = props.cooldownTicks;
        this.attackSerial = props.attackSerial;
    }
}
