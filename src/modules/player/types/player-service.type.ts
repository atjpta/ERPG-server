import { type Attributes } from "@/modules/player/schemas/stat.schema.js";

export interface LevelProgress {
    level: number;
    /** Exp tích luỹ trong level hiện tại. */
    exp: number;
}

export interface ExpGainResult extends LevelProgress {
    levelsGained: number;
}

export interface AttributeAllocationResult {
    allocatedAttributes: Attributes;
    attributePoints: number;
}
