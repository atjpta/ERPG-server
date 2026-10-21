/**
 * Kênh chat. Giá trị là khoá ổn định (lưu DB dạng text, key của `chat_config.channels`, gửi xuống client).
 * Thêm kênh mới: thêm member ở đây rồi làm theo mục "Thêm kênh mới" trong `src/rooms/chat/README.md`.
 */
export enum ChatChannelKey {
    /** Cả server (mọi người đang online trong chat room của server). */
    WORLD = "world",
    /** Chat local: những người cùng world room (cùng kênh của cùng một map / cùng instance dungeon). */
    GENERAL = "general",
    /** Thành viên cùng party. */
    PARTY = "party",
    /** Nhắn riêng 1-1. */
    WHISPER = "whisper",
}
