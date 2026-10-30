import { readFileSync } from "node:fs";
import {
    EntityBodiesSchema,
    type EntityBodies,
    type EntityBody,
} from "@/modules/bodies/schemas/entity-bodies.schema.js";

const FILE = new URL("../data/entity-bodies.json", import.meta.url);

let cached: EntityBodies | undefined;

export class EntityBodyService {
    /** Bodies exported from the Unity prefabs; a missing or malformed file is an error (run Sync Server in the Authoring Hub). */
    loadEntityBodies(): EntityBodies {
        cached ??= EntityBodiesSchema.parse(JSON.parse(readFileSync(FILE, "utf-8")));
        return cached;
    }

    /** Hitbox / collider of a monster prefab; throws when Unity did not export it. */
    monsterBody(code: string): EntityBody {
        const body = this.loadEntityBodies().monsters[code];
        if (!body)
            throw new Error(`[EntityBodies] No body for monster "${code}": sync it from Unity`);
        return body;
    }

    /** Hitbox / collider of a class prefab, falling back to its tier 1 base class; undefined when neither was exported. */
    classBody(classCode: string, baseClassCode?: string): EntityBody | undefined {
        const { classes } = this.loadEntityBodies();
        return classes[classCode] ?? (baseClassCode ? classes[baseClassCode] : undefined);
    }
}

export const entityBodyService = new EntityBodyService();
