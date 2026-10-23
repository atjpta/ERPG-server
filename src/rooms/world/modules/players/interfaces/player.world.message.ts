import type { AttributeValuesMessage, EquipmentsMessage } from "@/rooms/global/global.shared.js";

/** `data` của `playerView`; người đó không ở cùng map thì `Result` thất bại `PLAYER_NOT_HERE`. */
export interface PlayerViewMessage {
    playerId: string;
    name: string;
    level: number;
    classCode: string;
    baseClassCode: string;
    equipments: EquipmentsMessage;
    /** Attribute cuối cùng (class + đã cộng + trang bị). */
    attributes: AttributeValuesMessage;
    /** StatKey → giá trị (chỉ có stat khác 0). */
    stats: Record<string, number>;
}
