import { HitShape } from "@/modules/skills/enums/skill.enum.js";
import type { SkillHitEvent } from "@/modules/skills/schemas/skill-config.schema.js";
import type { HitboxColliderState } from "@/rooms/world/schema/hitbox-collider.world.state.js";

interface HitboxOrigin {
    x: number;
    y: number;
    direction: string;
    /**
     * Hướng ngắm (vector đơn vị, toạ độ server). Hit event `aimed` xoay vùng đánh theo hướng này (mọi hướng, không chỉ trái /
     * phải); thiếu thì dùng `direction`.
     */
    aim?: { x: number; y: number };
}

export function intersectsSkillHitEvent(
    origin: HitboxOrigin,
    targetX: number,
    targetY: number,
    targetCollider: HitboxColliderState,
    event: SkillHitEvent
): boolean {
    const aimed = event.aimed && origin.aim !== undefined;
    const forwardX = aimed ? origin.aim!.x : origin.direction === "left" ? -1 : 1;
    const forwardY = aimed ? origin.aim!.y : 0;
    // Không ngắm: attack art chỉ lật theo X, "lên" cục bộ là Y âm của world. Ngắm: trục ngang vuông góc với hướng ngắm.
    const lateralX = aimed ? forwardY : 0;
    const lateralY = aimed ? -forwardX : -1;

    const targetCenterX = targetX + targetCollider.offsetX;
    // Collider offsets are authored like the client prefab (positive Y up); the world grows down.
    const targetCenterY = targetY - targetCollider.offsetY;
    const targetDx = targetCenterX - origin.x;
    const targetDy = targetCenterY - origin.y;
    // Vùng đánh đứng cách người đánh `offsetX` về trước và `offsetY` lên trên: mục tiêu gần tâm vùng thêm chừng đó.
    const targetForward = targetDx * forwardX + targetDy * forwardY - (event.offsetX ?? 0);
    const targetLateral = targetDx * lateralX + targetDy * lateralY - (event.offsetY ?? 0);

    // Nửa kích thước hình chiếu của collider (hình chữ nhật song song trục) lên từng trục.
    const targetForwardHalf =
        (Math.abs(forwardX) * targetCollider.width + Math.abs(forwardY) * targetCollider.height) /
        2;
    const targetLateralHalf =
        (Math.abs(lateralX) * targetCollider.width + Math.abs(lateralY) * targetCollider.height) /
        2;
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

    if (event.shape === HitShape.ELLIPSE) {
        // Co trục dọc về cùng tỉ lệ với trục ngang thì elip thành hình tròn; hitbox mục tiêu vẫn là hình chữ nhật
        // song song trục nên điểm gần nhất tìm riêng từng trục rồi chia cho bán trục.
        const forwardRadius = event.width / 2;
        const lateralRadius = event.height / 2;
        if (forwardRadius <= 0 || lateralRadius <= 0) return false;
        const nearestForward = clamp(0, forwardMin, forwardMax) / forwardRadius;
        const nearestLateral = clamp(0, lateralMin, lateralMax) / lateralRadius;
        return nearestForward ** 2 + nearestLateral ** 2 <= 1;
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

/**
 * Chỗ đạn / vùng (AREA) của hit event bắt đầu: vị trí người đánh dời `offsetX` theo hướng mặt và `offsetY` lên trên
 * (toạ độ server, y hướng xuống). Client C# (SkillHitboxWorldUtil.OffsetOrigin) tính y hệt.
 */
export const offsetSkillOrigin = (
    x: number,
    y: number,
    direction: string,
    event: Pick<SkillHitEvent, "offsetX" | "offsetY">
) => ({
    x: x + (direction === "left" ? -1 : 1) * (event.offsetX ?? 0),
    y: y - (event.offsetY ?? 0),
});

function getEffectiveRange(range: number, shapeSize: number): number {
    if (range <= 0) return shapeSize;
    if (shapeSize <= 0) return range;
    return Math.min(range, shapeSize);
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
