import type { Attributes, Stats } from "@/modules/player/schemas/stat.schema.js";

export interface PlayerStats {
    attributes: Attributes;
    stats: Stats;
}
