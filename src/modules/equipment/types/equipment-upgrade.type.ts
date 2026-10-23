/** Nguyên liệu theo code item. */
export interface MaterialCost {
    code: string;
    quantity: number;
}

export interface UpgradeCost {
    rate: number;
    gold: number;
    materials: MaterialCost[];
}
