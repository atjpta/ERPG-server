/**
 * Collision dimensions in tile units, authored like the client prefab's Collider/HitBox:
 * the offset is from the position of the character, which is the CENTRE of its picture (not its feet), with positive offsetY pointing up.
 * Unity measures a prefab from the feet and writes the offset from the centre when it syncs (`entity-bodies.json`).
 */
export interface CollisionBounds {
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
}
