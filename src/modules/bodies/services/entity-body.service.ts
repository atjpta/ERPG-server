import { readFileSync } from "node:fs";
import {
    EntityBodiesSchema,
    type EntityBodies,
    type EntityBody,
} from "@/modules/bodies/schemas/entity-bodies.schema.js";

const FILE = new URL("../data/entity-bodies.json", import.meta.url);

let cached: EntityBodies | undefined;

/** Bodies exported from the Unity prefabs; a missing or malformed file is an error (run Sync Server in the Authoring Hub). */
export const loadEntityBodies = (): EntityBodies => {
    cached ??= EntityBodiesSchema.parse(JSON.parse(readFileSync(FILE, "utf-8")));
    return cached;
};

/** Hitbox / collider of a monster prefab; throws when Unity did not export it. */
export const monsterBody = (code: string): EntityBody => {
    const body = loadEntityBodies().monsters[code];
    if (!body) throw new Error(`[EntityBodies] No body for monster "${code}": sync it from Unity`);
    return body;
};

/** Hitbox / collider of a class prefab, falling back to its tier 1 base class; undefined when neither was exported. */
export const classBody = (classCode: string, baseClassCode?: string): EntityBody | undefined => {
    const { classes } = loadEntityBodies();
    return classes[classCode] ?? (baseClassCode ? classes[baseClassCode] : undefined);
};

/** Foot collider of an NPC prefab (tiles); throws when Unity did not export it. */
export const npcCollider = (code: string): EntityBody["collider"] => {
    const body = loadEntityBodies().npcs[code];
    if (!body) throw new Error(`[EntityBodies] No collider for npc "${code}": sync it from Unity`);
    return body.collider;
};
