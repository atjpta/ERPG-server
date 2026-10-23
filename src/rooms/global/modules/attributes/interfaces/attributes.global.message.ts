import type { AttributeValuesMessage } from "@/modules/player/interfaces/attribute.message.js";

export type { AttributeValuesMessage } from "@/modules/player/interfaces/attribute.message.js";

/** Điểm + attribute + stat sau khi tính lại (`PlayerRuntime.getAttributeSummary`). */
export interface AttributesMessage {
    attributePoints: number;
    allocatedAttributes: AttributeValuesMessage;
    attributes: AttributeValuesMessage;
    stats: Record<string, number>;
}
