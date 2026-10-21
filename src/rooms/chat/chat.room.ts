import type { AuthContext } from "colyseus";
import { SdkRoom } from "@/core/rooms/sdk-room.decorator.js";
import { KickReason } from "@/core/enums/kick-reason.enum.js";
import type { PlayerClient } from "@/core/rooms/base-player.room.js";
import { loadRoomMessages } from "@/core/utils/load-room-messages.util.js";
import { AuthenticatedPlayerRoom } from "@/rooms/authenticated-player.room.js";
import { OnCreateChatCommand } from "@/rooms/chat/commands/on-create.chat.command.js";
import { OnJoinChatCommand } from "@/rooms/chat/commands/on-join.chat.command.js";
import { OnLeaveChatCommand } from "@/rooms/chat/commands/on-leave.chat.command.js";
import { ChatJoinOptionsSchema, type ChatJoinOptions } from "@/rooms/chat/types/chat-room.type.js";
import { Dispatcher } from "@colyseus/command";
const messages = await loadRoomMessages(new URL(".", import.meta.url));

@SdkRoom({
    joins: [
        {
            room: "chat",
            options: ChatJoinOptionsSchema,
            doc: 'Vào bằng `JoinOrCreate("chat", { serverId })`: mỗi server một chat room; `serverId` phải là server của nhân vật đang đăng nhập. Chat chạy song song với world room, giữ kết nối suốt phiên chơi.',
        },
    ],
})
export class ChatRoom extends AuthenticatedPlayerRoom<{ client: PlayerClient }> {
    messages = messages;
    dispatcher = new Dispatcher(this);

    serverId = "";
    /** playerId → sessionId của kết nối chat. */
    readonly sessionOf = new Map<string, string>();
    /** playerId → thông tin hiển thị lấy lúc vào room. */
    readonly profileOf = new Map<string, { name: string }>();

    /** `serverId` trong options (dùng để ghép room) phải khớp token — không tin riêng options của client. */
    static override async onAuth(token: string, options: unknown, context: AuthContext) {
        const auth = await super.onAuth(token, options, context);
        const parsed = ChatJoinOptionsSchema.safeParse(options);
        if (!parsed.success || parsed.data.serverId !== auth.serverId) {
            throw new Error("Invalid chat server");
        }
        return auth;
    }

    /** Chat nằm cạnh kết nối world của cùng player nên không bị đá khi đăng nhập trùng ở room khác. */
    protected override shouldKickFor(reason: KickReason) {
        return reason !== KickReason.DUPLICATE_LOGIN;
    }
    registerPlayer(client: PlayerClient) {
        return this.registerOnlinePlayer(client, { kickDuplicateLogins: false });
    }
    unregisterPlayer(client: PlayerClient) {
        return this.unregisterOnlinePlayer(client);
    }

    async onCreate(options: ChatJoinOptions) {
        await this.dispatcher.dispatch(new OnCreateChatCommand(), options);
    }
    async onJoin(client: PlayerClient) {
        await this.dispatcher.dispatch(new OnJoinChatCommand(), { client });
    }
    async onLeave(client: PlayerClient) {
        await this.dispatcher.dispatch(new OnLeaveChatCommand(), { client });
    }
    onDispose() {
        this.dispatcher.stop();
    }
}
