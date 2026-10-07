import { HitDelivery, HitShape, ProjectileHitBehavior } from "@/modules/skills/enums/skill.enum.js";
import type { Skill } from "@/modules/skills/entities/skill.entity.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import { AreaWorldState } from "@/rooms/world/schema/area.world.state.js";
import { ProjectileWorldState } from "@/rooms/world/schema/projectile.world.state.js";
import type { PendingSkillHit } from "@/rooms/world/utils/skill-attack.world.util.js";
import { intersectsSkillHitEvent } from "@/rooms/world/utils/skill-hitbox.world.util.js";
import {
    SkillOwner,
    SkillTarget,
    applySkillHit,
    findSkillTargets,
} from "@/rooms/world/utils/skill-owner.world.util.js";
import { millisecondsToTicks } from "@/rooms/world/utils/tick.world.util.js";
import type { WorldRoom } from "@/rooms/world/world.room.js";

/** Bước kiểm tra va chạm tối đa (ô) của đạn trong 1 tick — đạn nhanh không xuyên qua mục tiêu nhỏ. */
const PROJECTILE_MAX_SWEEP_STEP = 0.1;

export interface SkillDeliveryParams {
    owner: SkillOwner;
    skill: Skill;
    hit: PendingSkillHit;
    /** Vị trí bên đánh lúc hit nổ (chân nhân vật, toạ độ server). */
    originX: number;
    originY: number;
    /** Mục tiêu để ngắm (PROJECTILE) / đặt vùng (AREA); không có → theo hướng mặt. */
    aim?: SkillTarget;
}

/**
 * Đưa một hit event tới mục tiêu theo `delivery`:
 * - HITBOX: vùng quanh người đánh, gây damage ngay.
 * - PROJECTILE: sinh `ProjectileWorldState`, mỗi tick bay một đoạn và trúng khi chạm hitbox mục tiêu.
 * - AREA: sinh `AreaWorldState` tại mục tiêu, gây damage cả vùng sau `area.delayMs`.
 * `chain()` chạy mỗi tick sau player và monster.
 */
export class SkillDeliveryWorldService {
    private nextId = 0;

    deliver(room: WorldRoom, params: SkillDeliveryParams): void {
        switch (params.hit.event.delivery ?? HitDelivery.HITBOX) {
            case HitDelivery.PROJECTILE:
                this.spawnProjectile(room, params);
                return;
            case HitDelivery.AREA:
                this.spawnArea(room, params);
                return;
            default:
                this.resolveHitbox(room, params);
        }
    }

    chain(room: WorldRoom, dt: number): void {
        for (const projectile of [...room.state.projectiles.values()]) {
            if (!this.stepProjectile(room, projectile, dt)) {
                room.state.projectiles.delete(projectile.id);
            }
        }
        for (const area of [...room.state.areas.values()]) {
            if (area.ticksUntilImpact > 0) {
                area.ticksUntilImpact--;
                continue;
            }
            this.resolveArea(room, area);
            room.state.areas.delete(area.id);
        }
    }

    private resolveHitbox(room: WorldRoom, { owner, hit, originX, originY }: SkillDeliveryParams) {
        const origin = { x: originX, y: originY, direction: hit.direction };
        for (const target of findSkillTargets(room, owner)) {
            if (intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, hit.event)) {
                applySkillHit(room, owner, target.id, hit);
            }
        }
    }

    private spawnProjectile(room: WorldRoom, params: SkillDeliveryParams): void {
        const { owner, skill, hit, aim } = params;
        const projectile = hit.event.projectile;
        if (!projectile) {
            console.warn(`[Skill] ${skill.code}: PROJECTILE hit event without projectile config`);
            return;
        }

        // Đầu đạn ở offset của event (x trước mặt, y hướng lên như HITBOX), bay về giữa hitbox mục tiêu.
        const forward = hit.direction === "left" ? -1 : 1;
        const x = params.originX + forward * hit.event.offsetX;
        const y = params.originY - hit.event.offsetY;
        let dirX = forward;
        let dirY = 0;
        if (aim) {
            const dx = aim.x + aim.hitbox.offsetX - x;
            const dy = aim.y - aim.hitbox.offsetY - y;
            const length = Math.hypot(dx, dy);
            if (length > 1e-6) {
                dirX = dx / length;
                dirY = dy / length;
            }
        }

        const id = this.newId("p");
        room.state.projectiles.set(
            id,
            new ProjectileWorldState({
                id,
                owner,
                skillId: skill.id,
                hit,
                projectile,
                x,
                y,
                dirX,
                dirY,
            })
        );
    }

    /** Bay 1 tick, trúng mục tiêu dọc đường. `false` = đạn hết (trúng đủ, hết tầm, ra khỏi map). */
    private stepProjectile(room: WorldRoom, projectile: ProjectileWorldState, dt: number): boolean {
        const distance = Math.min(
            projectile.speed * dt,
            projectile.maxDistance - projectile.traveled
        );
        const steps = Math.max(1, Math.ceil(distance / PROJECTILE_MAX_SWEEP_STEP));
        const stepDistance = distance / steps;
        const body = projectileBody(projectile);
        const targets = findSkillTargets(room, projectile.owner);
        const maxHits =
            projectile.projectile.hitBehavior === ProjectileHitBehavior.PIERCE
                ? projectile.projectile.maxHits
                : 1;

        for (let step = 0; step < steps; step++) {
            projectile.x += projectile.dirX * stepDistance;
            projectile.y += projectile.dirY * stepDistance;
            projectile.traveled += stepDistance;
            const origin = { x: projectile.x, y: projectile.y, direction: "right" };
            for (const target of targets) {
                if (projectile.hitIds.has(target.id)) continue;
                if (!intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, body)) {
                    continue;
                }
                projectile.hitIds.add(target.id);
                applySkillHit(room, projectile.owner, target.id, projectile);
                if (projectile.hitIds.size >= maxHits) return false;
            }
        }

        const inMap =
            projectile.x >= 0 &&
            projectile.y >= 0 &&
            projectile.x <= room.map.width &&
            projectile.y <= room.map.height;
        return inMap && projectile.traveled < projectile.maxDistance;
    }

    private spawnArea(room: WorldRoom, params: SkillDeliveryParams): void {
        const { owner, skill, hit, aim, originX, originY } = params;
        const area = hit.event.area;
        if (!area) {
            console.warn(`[Skill] ${skill.code}: AREA hit event without area config`);
            return;
        }

        // Tâm vùng = chân mục tiêu, kéo về trong castRange; không có mục tiêu → trước mặt.
        let x = originX + (hit.direction === "left" ? -1 : 1) * area.untargetedDistance;
        let y = originY;
        if (aim) {
            const dx = aim.x - originX;
            const dy = aim.y - originY;
            const length = Math.hypot(dx, dy);
            const scale =
                skill.castRange > 0 && length > skill.castRange ? skill.castRange / length : 1;
            x = originX + dx * scale;
            y = originY + dy * scale;
        }
        x = Math.min(Math.max(x, 0), room.map.width);
        y = Math.min(Math.max(y, 0), room.map.height);

        const id = this.newId("a");
        room.state.areas.set(
            id,
            new AreaWorldState({
                id,
                owner,
                skillId: skill.id,
                hit,
                x,
                y,
                ticksUntilImpact:
                    area.delayMs > 0 ? millisecondsToTicks(area.delayMs, room.tickRate) : 0,
            })
        );
    }

    private resolveArea(room: WorldRoom, area: AreaWorldState): void {
        // Vùng là shape của event đặt tại tâm vùng (offset bỏ qua, không phụ thuộc hướng).
        const event: SkillHitEvent = { ...area.event, offsetX: 0, offsetY: 0 };
        const origin = { x: area.x, y: area.y, direction: "right" };
        for (const target of findSkillTargets(room, area.owner)) {
            if (intersectsSkillHitEvent(origin, target.x, target.y, target.hitbox, event)) {
                applySkillHit(room, area.owner, target.id, area);
            }
        }
    }

    private newId(prefix: string): string {
        this.nextId = (this.nextId + 1) % Number.MAX_SAFE_INTEGER;
        return `${prefix}${this.nextId.toString(36)}`;
    }
}

/** Thân đạn: hình tròn bán kính `radius` quanh vị trí đạn. */
const projectileBody = (projectile: ProjectileWorldState): SkillHitEvent => ({
    ...projectile.event,
    shape: HitShape.CIRCLE,
    range: 0,
    radius: projectile.radius,
    offsetX: 0,
    offsetY: 0,
});

export const skillDeliveryWorldService = new SkillDeliveryWorldService();
