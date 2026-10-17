import jwt from "jsonwebtoken";
import { env } from "@/configs/env.config.js";
import { UserSessionRepo } from "@/modules/auth/repositories/user-session.repository.js";
import type { AuthUser } from "@/modules/auth/types/auth-user.type.js";
export class UserSessionService {
    async verifyToken(token: string): Promise<AuthUser> {
        const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
        if (payload.typ !== "user") throw new Error("Invalid token type");
        await this.assertSessionActive(payload.userId, payload.userSessionId);
        return payload;
    }

    /** Đối chiếu session với DB — revoke khi logout/force-logout/ban/login máy khác. */
    async assertSessionActive(userId: string, sessionId: string) {
        const session = await UserSessionRepo.findById({ id: sessionId });
        if (!session || session.revoked || session.userId !== userId) {
            throw new Error("Session revoked");
        }
        return session;
    }
}

export const userSessionService = new UserSessionService();
