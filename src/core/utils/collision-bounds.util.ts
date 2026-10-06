import type { CollisionBounds } from "@/core/types/collision-bounds.type.js";

/** Phóng to/thu nhỏ quanh chân nhân vật (kích thước + offset cùng nhân `scale`). */
export const scaleCollisionBounds = (bounds: CollisionBounds, scale: number): CollisionBounds => ({
    width: bounds.width * scale,
    height: bounds.height * scale,
    offsetX: (bounds.offsetX ?? 0) * scale,
    offsetY: (bounds.offsetY ?? 0) * scale,
});
