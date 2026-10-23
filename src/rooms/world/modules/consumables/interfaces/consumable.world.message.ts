export interface PotionUsedMessage {
    /** playerId của người uống / được hồi — khoá của nhân vật bên client. */
    playerId: string;
    /** HP / MP hồi được. Bình: đã trừ phần vượt trần; hồi của skill: lượng hồi của skill, hiện cả khi đã đầy máu. */
    hp: number;
    mp: number;
}
