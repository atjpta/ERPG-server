import { HitShape } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";

interface HitboxOrigin {
    x: number;
    y: number;
    direction: string;
}

export function intersectsSkillHitEvent(
    origin: HitboxOrigin,
    targetX: number,
    targetY: number,
    targetCollider: HitboxColliderState,
    event: SkillHitEvent
): boolean {
    const forwardX = origin.direction === "left" ? -1 : 1;
    const forwardY = 0;
    const lateralX = 0;
    // Attack art is mirrored only on X. Positive local offsetY always points up on the client,
    // which is negative Y in the server's world coordinates.
    const lateralY = -1;

    const targetCenterX = targetX + targetCollider.offsetX;
    // Collider offsets are authored like the client prefab (positive Y up); the world grows down.
    const targetCenterY = targetY - targetCollider.offsetY;
    const targetDx = targetCenterX - origin.x;
    const targetDy = targetCenterY - origin.y;
    const targetForward = targetDx * forwardX + targetDy * forwardY - event.offsetX;
    const targetLateral = targetDx * lateralX + targetDy * lateralY - event.offsetY;

    const targetForwardHalf =
        Math.abs(forwardX) > 0 ? targetCollider.width / 2 : targetCollider.height / 2;
    const targetLateralHalf =
        Math.abs(lateralX) > 0 ? targetCollider.width / 2 : targetCollider.height / 2;
    const forwardMin = targetForward - targetForwardHalf;
    const forwardMax = targetForward + targetForwardHalf;
    const lateralMin = targetLateral - targetLateralHalf;
    const lateralMax = targetLateral + targetLateralHalf;

    if (event.shape === HitShape.ARC) {
        const radius = getEffectiveRange(event.range, event.radius);
        const nearestForward = clamp(0, forwardMin, forwardMax);
        const nearestLateral = clamp(0, lateralMin, lateralMax);
        if (nearestForward ** 2 + nearestLateral ** 2 > radius ** 2) return false;

        const centerDistance = Math.hypot(targetForward, targetLateral);
        if (centerDistance <= Math.hypot(targetForwardHalf, targetLateralHalf)) return true;

        const colliderRadius = Math.hypot(targetForwardHalf, targetLateralHalf);
        const angleToTarget = Math.atan2(Math.abs(targetLateral), targetForward);
        const colliderAngularRadius = Math.asin(Math.min(1, colliderRadius / centerDistance));
        return (
            targetForward + colliderRadius >= 0 &&
            angleToTarget <= (event.angle * Math.PI) / 180 / 2 + colliderAngularRadius
        );
    }

    if (event.shape === HitShape.CIRCLE) {
        const radius = getEffectiveRange(event.range, event.radius);
        const nearestForward = clamp(0, forwardMin, forwardMax);
        const nearestLateral = clamp(0, lateralMin, lateralMax);
        return nearestForward ** 2 + nearestLateral ** 2 <= radius ** 2;
    }

    if (event.shape === HitShape.RECT) {
        const attackLength = event.range > 0 ? event.range : event.height;
        const attackWidth = event.width > 0 ? event.width : event.height;
        return (
            forwardMax >= 0 &&
            forwardMin <= attackLength &&
            lateralMax >= -attackWidth / 2 &&
            lateralMin <= attackWidth / 2
        );
    }

    const capsuleRadius =
        event.radius > 0 ? event.radius : (event.width > 0 ? event.width : event.height) / 2;
    const capsuleLength = getEffectiveRange(event.range, event.height);
    const forwardGap =
        forwardMin > capsuleLength ? forwardMin - capsuleLength : forwardMax < 0 ? -forwardMax : 0;
    const lateralGap = lateralMin > 0 ? lateralMin : lateralMax < 0 ? -lateralMax : 0;
    return forwardGap ** 2 + lateralGap ** 2 <= capsuleRadius ** 2;
}

function getEffectiveRange(range: number, shapeSize: number): number {
    if (range <= 0) return shapeSize;
    if (shapeSize <= 0) return range;
    return Math.min(range, shapeSize);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
