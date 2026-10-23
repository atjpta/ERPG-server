/** Kết quả `PartyStateManager.remove`: để nơi gọi biết cần báo gì cho ai. */
export interface PartyRemoval {
    /** Tên người vừa rời. */
    name: string;
    /** Chủ mới nếu người rời là chủ và party còn người. */
    newLeaderId?: string;
    /** Party đã hết người (hoặc đã giải tán trước đó) nên không còn ai để báo. */
    gone: boolean;
}
