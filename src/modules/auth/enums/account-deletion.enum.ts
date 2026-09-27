export enum AccountDeletionSource {
    /** Người chơi tự xoá trong game — xử lý ngay. */
    APP = "app",
    /** Gửi từ trang web xoá tài khoản (link khai báo trên Google Play) — admin xử lý. */
    WEB = "web",
}

export enum AccountDeletionStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    REJECTED = "rejected",
}
