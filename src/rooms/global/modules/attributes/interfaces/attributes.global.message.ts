/** Điểm attribute theo từng attribute. */
export interface AttributeValuesMessage {
    strength: number;
    dexterity: number;
    intelligence: number;
    vitality: number;
    luck: number;
}

/** Điểm + attribute + stat sau khi tính lại (`PlayerDataState.getAttributeSummary`). */
export interface AttributesMessage {
    attributePoints: number;
    allocatedAttributes: AttributeValuesMessage;
    attributes: AttributeValuesMessage;
    stats: Record<string, number>;
}
