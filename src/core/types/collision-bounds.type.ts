/**
 * Collision dimensions in tile units, authored like the client prefab's Collider/HitBox:
 * the offset is from the character's feet with positive offsetY pointing up.
 */
export interface CollisionBounds {
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
}
