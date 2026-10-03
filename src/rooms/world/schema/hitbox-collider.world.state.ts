import { Schema, type } from "@colyseus/schema";
import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";
import { HitShape } from "@/modules/skills/enums/skill.enum.js";

export class HitboxColliderState extends Schema {
    @type("string") shape = HitShape.RECT;
    @type("float32") offsetX = 0;
    @type("float32") offsetY = 0;
    @type("float32") width: number;
    @type("float32") height: number;
    @type("float32") radius = 0;
    @type("float32") angle = 0;

    constructor(bounds: CollisionBounds) {
        super();
        this.width = bounds.width;
        this.height = bounds.height;
        this.offsetX = bounds.offsetX ?? 0;
        this.offsetY = bounds.offsetY ?? 0;
    }
}
