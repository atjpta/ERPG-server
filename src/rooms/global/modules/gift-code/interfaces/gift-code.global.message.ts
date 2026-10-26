/* DTO gift code gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

/** Kết quả nhập gift code. */
export interface GiftCodeRedeemedMessage {
    /** Thư chứa quà vừa vào hộp thư (cũng đến qua push `mailReceived` nếu bạn đang kết nối global). */
    mailId: string;
}
