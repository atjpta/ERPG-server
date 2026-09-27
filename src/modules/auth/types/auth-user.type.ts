import type { JwtPayload } from "jsonwebtoken";
import type { AdminRole } from "@/modules/auth/enums/admin.enum.js";

/**
 * Claim trỏ tới `user_sessions.id` đặt tên `userSessionId`, **không** đặt `sessionId`: Colyseus 0.18
 * lấy `authData.sessionId` (giá trị `onAuth` trả về) làm `client.sessionId` → mọi kết nối cùng token
 * sẽ trùng sessionId (MatchMaker: `authData?.sessionId || generateId()`).
 */

/** Payload token tài khoản — `ctx.context` sau `authMiddleware`. */
export type AuthUser = { typ: "user"; userId: string; userSessionId: string } & JwtPayload;

/**
 * Payload token player — trả về lúc login, dùng để join room Colyseus (`client.auth`)
 * và gọi API gắn với player (`ctx.context` sau `authPlayerMiddleware`).
 */
export type AuthPlayer = {
    typ: "player";
    userId: string;
    userSessionId: string;
    playerId: string;
    serverId: string;
} & JwtPayload;

/** Payload token admin — ký bằng `ADMIN_JWT_SECRET`, `ctx.context` sau `adminAuthMiddleware`. */
export type AuthAdmin = { typ: "admin"; adminId: string; role: AdminRole } & JwtPayload;
