import { z } from "zod";

const BoundsSchema = z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    offsetX: z.number().default(0),
    offsetY: z.number().default(0),
});

const BodySchema = z.object({ hitbox: BoundsSchema, collider: BoundsSchema });

/**
 * `entity-bodies.json`, exported from the Unity prefabs (`Tools/ERPG/Sync Server`): the HitBox / Collider
 * BoxCollider2D of each monster and each class (plus the foot Collider of each NPC), in tiles, offset from the feet with positive Y up.
 */
export const EntityBodiesSchema = z.object({
    monsters: z.record(z.string(), BodySchema),
    classes: z.record(z.string(), BodySchema),
    /** NPCs: only the foot collider (an NPC without its own prefab uses the base NPC one). */
    npcs: z.record(z.string(), z.object({ collider: BoundsSchema })),
});

export type EntityBody = z.infer<typeof BodySchema>;
export type EntityBodies = z.infer<typeof EntityBodiesSchema>;
