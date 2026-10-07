import { Schema, type } from "@colyseus/schema";

import type { PendingSkillHit } from "@/rooms/world/utils/skill-attack.world.util.js";
import type {
    SkillHitEvent,
    SkillProjectile,
} from "@/modules/skills/schemas/skill-config.schema.js";
import type { SkillOwner } from "@/rooms/world/utils/skill-owner.world.util.js";

/**
 * Đạn đang bay (hit event `PROJECTILE`). Client vẽ từ vị trí/hướng/tốc độ này và tự nội suy; đạn
 * bị xoá khỏi `WorldState.projectiles` khi trúng (DESTROY / hết `maxHits`), bay hết `maxDistance`
 * hoặc ra khỏi map. Toạ độ server: ô, y hướng xuống.
 */
export class ProjectileWorldState extends Schema {
    @type("string") id: string;
    /** Id player/monster bắn ra. */
    @type("string") ownerId: string;
    /** Client tra `skills.json` (hình đạn, hiệu ứng) theo `skillId` + `eventIndex`. */
    @type("string") skillId: string;
    @type("uint8") eventIndex: number;
    @type("float32") x: number;
    @type("float32") y: number;
    /** Hướng bay đã chuẩn hoá. */
    @type("float32") dirX: number;
    @type("float32") dirY: number;
    /** Ô / giây. */
    @type("float32") speed: number;
    @type("float32") radius: number;
    @type("float32") maxDistance: number;

    owner: SkillOwner;
    event: SkillHitEvent;
    projectile: SkillProjectile;
    attackSerial: number;
    traveled = 0;
    /** Mục tiêu đã trúng — PIERCE không trúng lại cùng một con. */
    readonly hitIds = new Set<string>();

    constructor(props: {
        id: string;
        owner: SkillOwner;
        skillId: string;
        hit: Pick<PendingSkillHit, "event" | "attackSerial" | "eventIndex">;
        projectile: SkillProjectile;
        x: number;
        y: number;
        dirX: number;
        dirY: number;
    }) {
        super();
        this.id = props.id;
        this.owner = props.owner;
        this.ownerId = props.owner.id;
        this.skillId = props.skillId;
        this.event = props.hit.event;
        this.eventIndex = props.hit.eventIndex;
        this.projectile = props.projectile;
        this.attackSerial = props.hit.attackSerial;
        this.x = props.x;
        this.y = props.y;
        this.dirX = props.dirX;
        this.dirY = props.dirY;
        this.speed = props.projectile.speed;
        this.radius = props.projectile.radius;
        this.maxDistance = props.projectile.maxDistance;
    }
}
