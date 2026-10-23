/* DTO chat gửi xuống client (`yarn unity:network` sinh C#: interface tên kết thúc `Message`). */

/** Một tin chat — dùng chung cho mọi kênh, client phân loại theo `channel`. */
export interface ChatReceivedMessage {
    /** uuid v7, tăng theo thời gian: dùng để khử trùng realtime/lịch sử và làm con trỏ `before` của `getHistory`. */
    id: string;
    /** Giá trị của `ChatChannelKey` (`world`, `general`, `party`, `whisper`...). */
    channel: string;
    senderId: string;
    senderName: string;
    content: string;
    /** Thời điểm server nhận tin (epoch ms). */
    sentAt: number;
    /** Whisper: id người nhận (để client biết tin này gửi đi hay nhận về). */
    targetId?: string;
}

/** `data` của response `getHistory`. */
export interface ChatHistoryMessage {
    channel: string;
    /** Cũ → mới. */
    messages: ChatReceivedMessage[];
    /** Còn tin cũ hơn `messages[0]`: client cho phép tải thêm (`getHistory` với `before = messages[0].id`). */
    hasMore: boolean;
}
