import { MapType } from "@/modules/maps/enums/map.enum.js";

export interface MapPlaceholder {
    code: string;
    type: MapType;
    minLevel: number;
    /** Chỉ dungeon: level quái tối đa. */
    dungeonMaxLevel?: number;
    /** Id spawn `arrival` mà portal/teleport khác trỏ tới (file Unity phải có đủ các id này). */
    arrivalSpawnIds: string[];
}

/**
 * Các map phải tồn tại. Có `data/<code>.map.json` thì dùng file (layout từ Unity); chưa có thì seed
 * tạo row placeholder inactive và server cảnh báo lúc khởi động. Chỉ khai metadata, không toạ độ.
 */
export const MAP_REGISTRY: MapPlaceholder[] = [
    {
        code: "greenfield_village",
        type: MapType.TOWN,
        minLevel: 1,
        arrivalSpawnIds: ["from_field"],
    },
    {
        code: "greenfield_plains",
        type: MapType.FIELD,
        minLevel: 1,
        arrivalSpawnIds: ["from_village"],
    },
    {
        code: "whispering_forest",
        type: MapType.FIELD,
        minLevel: 10,
        arrivalSpawnIds: ["from_village", "from_evergrowth"],
    },
    {
        code: "deep_evergrowth",
        type: MapType.FIELD,
        minLevel: 20,
        arrivalSpawnIds: ["from_forest"],
    },
    {
        code: "slime_hollow",
        type: MapType.DUNGEON,
        minLevel: 1,
        dungeonMaxLevel: 10,
        arrivalSpawnIds: ["from_plains"],
    },
    {
        code: "werewolf_den",
        type: MapType.DUNGEON,
        minLevel: 10,
        dungeonMaxLevel: 20,
        arrivalSpawnIds: ["from_forest"],
    },
    {
        code: "sanctuary_of_life",
        type: MapType.DUNGEON,
        minLevel: 20,
        dungeonMaxLevel: 30,
        arrivalSpawnIds: ["from_evergrowth"],
    },
];
