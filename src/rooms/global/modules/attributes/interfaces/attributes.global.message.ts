import type { AttributeValuesMessage } from "@/modules/player/interfaces/attribute.message.js";

export type { AttributeValuesMessage } from "@/modules/player/interfaces/attribute.message.js";

/** Điểm + attribute + stat sau khi tính lại (`PlayerState.getAttributeSummary`). */
export interface AttributesMessage {
    attributePoints: number;
    allocatedAttributes: AttributeValuesMessage;
    attributes: AttributeValuesMessage;
    stats: Record<string, number>;
}

/** Chi tiết attribute đổi (push `attributes`): `attributePoints` luôn có (số nhỏ), còn lại chỉ có phần vừa đổi, không có thì client giữ số cũ; `stats` chỉ gồm các stat đổi. */
export interface AttributesChangedMessage {
    attributePoints: number;
    allocatedAttributes?: AttributeValuesMessage;
    attributes?: AttributeValuesMessage;
    stats?: Record<string, number>;
}
