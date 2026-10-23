import { Schema } from "@colyseus/schema";

/**
 * Ngôn ngữ gần nhất mà mỗi người đang kết nối global đã xin (`mailList`) — state chỉ ở server (không field `@type` nên
 * không sync). Dùng để push `mailReceived` đúng ngôn ngữ. Chỉ đổi dữ liệu, không gửi message (xem `mailGlobalService`).
 */
export class MailsState extends Schema {
    private readonly localeByPlayerId = new Map<string, string>();

    /** `undefined` = chưa xin lần nào (dùng ngôn ngữ mặc định của `mail_config`). */
    localeOf(playerId: string): string | undefined {
        return this.localeByPlayerId.get(playerId);
    }

    setLocale(playerId: string, locale: string) {
        this.localeByPlayerId.set(playerId, locale);
    }

    unload(playerId: string) {
        this.localeByPlayerId.delete(playerId);
    }
}
