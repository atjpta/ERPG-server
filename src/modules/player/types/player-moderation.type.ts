import type { Direction } from "@/modules/player/enums/player.enum.js";

/** Thay đổi GM áp lên player (tên + level / exp / vị trí — vd kéo player bị kẹt map về làng). */
export interface PlayerAdminUpdate {
    name?: string;
    level?: number;
    exp?: number;
    hp?: number;
    mp?: number;
    mapCode?: string;
    x?: number;
    y?: number;
    direction?: Direction;
}
