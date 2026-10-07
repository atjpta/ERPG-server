import { Schema, type } from "@colyseus/schema";

import type { PendingSkillHit } from "@/rooms/world/utils/skill-attack.world.util.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import type { SkillOwner } from "@/rooms/world/utils/skill-owner.world.util.js";

/**
 * Vùng sát thương đặt trên mặt đất (hit event `AREA`): gây damage cho mọi mục tiêu chạm vùng khi
 * `ticksUntilImpact` về 0, rồi bị xoá khỏi `WorldState.areas`. Client vẽ hiệu ứng tại (x, y) — chân
 * mục tiêu — và nổ đúng lúc đó. Toạ độ server: ô, y hướng xuống.
 */
export class AreaWorldState extends Schema {
    @type("string") id: string;
    @type("string") ownerId: string;
    @type("string") skillId: string;
    @type("uint8") eventIndex: number;
    @type("float32") x: number;
    @type("float32") y: number;
    @type("float32") radius: number;
    @type("uint8") ticksUntilImpact: number;

    owner: SkillOwner;
    event: SkillHitEvent;
    attackSerial: number;

    constructor(props: {
        id: string;
        owner: SkillOwner;
        skillId: string;
        hit: Pick<PendingSkillHit, "event" | "attackSerial" | "eventIndex">;
        x: number;
        y: number;
        ticksUntilImpact: number;
    }) {
        super();
        this.id = props.id;
        this.owner = props.owner;
        this.ownerId = props.owner.id;
        this.skillId = props.skillId;
        this.event = props.hit.event;
        this.eventIndex = props.hit.eventIndex;
        this.attackSerial = props.hit.attackSerial;
        this.x = props.x;
        this.y = props.y;
        this.radius = this.event.radius > 0 ? this.event.radius : this.event.range;
        this.ticksUntilImpact = props.ticksUntilImpact;
    }
}
