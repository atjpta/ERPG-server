/*
 * Payload message của chat room — `yarn unity:network` sinh C# (xem ghi chú ở types/world-message.type.ts:
 * chỉ interface có chữ "Message" trong tên + enum, khai báo từng field).
 */

/** Message client → chat room. Mỗi kênh một key; payload cụ thể ở từng command. */
export enum ChatClientMessage {
    /** `{ content }` — nói với cả server. */
    SEND_WORLD = "sendWorld",
    /** `{ content }` — chat local: nói với người cùng world room (cùng kênh của một map). */
    SEND_GENERAL = "sendGeneral",
    /** `{ content }` — nói với thành viên party. */
    SEND_PARTY = "sendParty",
    /** `{ targetName, content }` — nhắn riêng cho người chơi online theo tên. */
    SEND_WHISPER = "sendWhisper",
    /**
     * `{ channel, before? }` — xin lịch sử của một kênh có lưu DB. Không có `before`: trang mới nhất; có `before`
     * (`id` của tin cũ nhất đang hiện): trang tin cũ hơn nó (loadmore). Server đã tự gửi trang mới nhất lúc vào room.
     */
    GET_HISTORY = "getHistory",
}

/** Message server → client của chat room. */
export enum ChatMessage {
    /** Có tin mới ở một kênh bạn thuộc về (kể cả tin do chính bạn gửi). `data` là `ChatReceivedMessage`. */
    RECEIVED = "received",
    /** Lịch sử của một kênh (cũ → mới). `data` là `ChatHistoryMessage`. */
    HISTORY = "history",
    /** Kết quả khi tin bạn gửi bị từ chối: `Result` thất bại với mã `CHAT_*` / `TOO_MANY_REQUESTS` / `INVALID_INPUT`. Gửi thành công thì không có reply này mà bạn nhận `RECEIVED`. */
    SEND_RESULT = "sendResult",
}

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

/** `data` của `ChatMessage.HISTORY`. */
export interface ChatHistoryMessage {
    channel: string;
    /** Cũ → mới. */
    messages: ChatReceivedMessage[];
    /** Còn tin cũ hơn `messages[0]`: client cho phép tải thêm (`getHistory` với `before = messages[0].id`). */
    hasMore: boolean;
}
