import type { EquipmentsMessage } from "@/modules/equipment/interfaces/equipment.message.js";
import type { AttributeValuesMessage } from "@/modules/player/interfaces/attribute.message.js";

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
