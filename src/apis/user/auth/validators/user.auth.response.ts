import { z } from "zod";
import { GameServerStatus } from "@/modules/auth/enums/game-server.enum.js";
import { ClientPlatform } from "@/core/enums/client-platform.enum.js";
import { OauthProvider } from "@/modules/auth/enums/oauth-provider.enum.js";
import { UserStatus } from "@/modules/auth/enums/user.enum.js";
import { UserPlayerRefResponse } from "@/apis/user/player/validators/user.player.response.js";

/*
 * Schema `data` của endpoint `/user/auth/*` và `/user/game-servers` — nguồn để `yarn unity:network` sinh class C#.
 * Chỉ khai báo field client dùng; server có thể trả thêm field khác, client bỏ qua.
 */

/** Kết quả đăng ký / đăng nhập mọi kiểu. */
export const UserAuthResultResponse = z.object({
    /** User token (tài khoản) — gửi kèm mọi API `/user/*`. */
    token: z.string(),
    /** Player token của nhân vật đầu tiên để join room; `null` nếu tài khoản chưa có nhân vật. */
    playerToken: z.string().nullable(),
    userId: z.string(),
    /** Nhân vật đầu tiên; `null` nếu chưa có (gọi `POST /user/players` để tạo). */
    player: UserPlayerRefResponse.nullable(),
});

export const UserOauthNonceResponse = z.object({ nonce: z.string() });

/** `GET /user/auth/me`. */
export const UserProfileResponse = z.object({
    id: z.string(),
    email: z.string(),
    status: z.enum(UserStatus),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
});

/** Một cách đăng nhập đã liên kết với tài khoản (`google`, `play_games`, `guest`). */
export const UserOauthAccountResponse = z.object({
    provider: z.enum(OauthProvider),
    /** Email của tài khoản bên thứ ba nếu có (khách không có). */
    email: z.string().nullable(),
    linkedAt: z.string(),
});

/** Một phiên đăng nhập (thiết bị). */
export const UserSessionResponse = z.object({
    id: z.string(),
    platform: z.enum(ClientPlatform),
    clientVersion: z.string(),
    device: z.string(),
    createdAt: z.string(),
});

/** Game server hiển thị ở màn chọn server. */
export const UserGameServerResponse = z.object({
    id: z.string(),
    code: z.string(),
    status: z.enum(GameServerStatus),
});
